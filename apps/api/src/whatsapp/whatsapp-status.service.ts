import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import {
  Prisma,
  WhatsAppMessageStatus,
  WhatsAppStatusWebhookOutcome,
} from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import { WhatsAppCredentialCipher } from './whatsapp-credential-cipher';
import {
  decideWhatsAppStatusTransition,
  toWhatsAppInternalStatus,
  whatsappStatusWebhookSchema,
  type WhatsAppInternalStatus,
} from './whatsapp-status.contract';
import { verifySimulatedWhatsAppStatusSignature } from './whatsapp-status-signature';

interface ReceiveCommand {
  readonly rawBody: Buffer;
  readonly signature: string;
  readonly storeId: string;
}

interface LockedMessageRow {
  id: string;
}

type StatusOutcome =
  | 'applied'
  | 'ignored_duplicate_status'
  | 'ignored_out_of_order'
  | 'ignored_terminal_state'
  | 'ignored_unknown_message';

export interface WhatsAppStatusResult {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly eventId: string;
  readonly messageId: string | null;
  readonly mode: 'simulation';
  readonly observedStatus:
    'simulated_delivered' | 'simulated_failed' | 'simulated_read' | 'simulated_sent';
  readonly outcome: StatusOutcome;
}

@Injectable()
export class WhatsAppStatusService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: WhatsAppCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  public async receive(command: ReceiveCommand): Promise<WhatsAppStatusResult> {
    this.assertEnabled();
    if (command.rawBody.length === 0) throw new BadRequestException('Webhook body is required');
    if (command.rawBody.length > this.environment.whatsappWebhooks.maxBodyBytes) {
      this.metrics.recordWhatsAppStatusWebhook('body_too_large');
      throw new PayloadTooLargeException('Webhook body exceeds the configured limit');
    }
    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        encryptedWebhookSecretJson: { not: Prisma.DbNull },
        lastHealthStatus: 'HEALTHY',
        provider: 'WHATSAPP',
        status: 'ACTIVE',
        storeId: command.storeId,
      },
    });
    if (connection === null || connection.encryptedWebhookSecretJson === null) {
      this.metrics.recordWhatsAppStatusWebhook('target_unavailable');
      throw new NotFoundException('WhatsApp webhook target not found');
    }
    const webhookSecret = this.cipher.decryptWebhookSecret(
      connection.encryptedWebhookSecretJson,
      connection.organizationId,
      command.storeId,
    );
    if (
      !verifySimulatedWhatsAppStatusSignature(command.rawBody, command.signature, webhookSecret)
    ) {
      await this.recordRejected(connection.organizationId, command.storeId, 'invalid_signature');
      throw new UnauthorizedException('Invalid WhatsApp webhook');
    }
    const event = this.parse(command.rawBody);
    const payloadHash = this.sha256(command.rawBody);
    const existing = await this.findReplay(command.storeId, event.externalEventId, payloadHash);
    if (existing !== null) return existing;

    try {
      const result = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            const [locked] = await transaction.$queryRaw<LockedMessageRow[]>`
              SELECT id
              FROM whatsapp_messages
              WHERE organization_id = ${connection.organizationId}::uuid
                AND store_id = ${command.storeId}::uuid
                AND provider_message_id = ${event.providerMessageId}
              FOR UPDATE
            `;
            const message =
              locked === undefined
                ? null
                : await transaction.whatsAppMessage.findUnique({ where: { id: locked.id } });
            const eventId = randomUUID();
            const observedStatus = toWhatsAppInternalStatus(event.status);
            const occurredAt = new Date(event.occurredAt);
            const now = new Date();
            const providerMessageIdHash = this.sha256(Buffer.from(event.providerMessageId, 'utf8'));
            const correlationId = this.requestContext.correlationId ?? randomUUID();

            if (message === null) {
              await transaction.whatsAppStatusWebhookEvent.create({
                data: {
                  eventType: event.eventType,
                  externalEventId: event.externalEventId,
                  fixtureVersion: event._fixture.version,
                  id: eventId,
                  observedStatus,
                  occurredAt,
                  organizationId: connection.organizationId,
                  outcome: WhatsAppStatusWebhookOutcome.IGNORED,
                  payloadHash,
                  payloadRedactedJson: this.redacted(event.status),
                  processedAt: now,
                  providerMessageIdHash,
                  receivedAt: now,
                  rejectionReason: 'unknown_message',
                  storeId: command.storeId,
                },
              });
              await transaction.auditLog.create({
                data: {
                  action: 'whatsapp.status_webhook.ignored',
                  correlationId,
                  metadataJson: {
                    mode: 'simulation',
                    observedStatus: event.status,
                    reason: 'unknown_message',
                  },
                  organizationId: connection.organizationId,
                  outcome: 'SUCCESS',
                  resourceId: eventId,
                  resourceType: 'whatsapp_status_webhook_event',
                },
              });
              return this.result(
                eventId,
                null,
                observedStatus,
                WhatsAppStatusWebhookOutcome.IGNORED,
                'unknown_message',
                false,
              );
            }

            const currentStatus = message.status;
            const decision = decideWhatsAppStatusTransition(currentStatus, observedStatus);
            await transaction.whatsAppStatusWebhookEvent.create({
              data: {
                eventType: event.eventType,
                externalEventId: event.externalEventId,
                fixtureVersion: event._fixture.version,
                id: eventId,
                messageId: message.id,
                observedStatus,
                occurredAt,
                organizationId: connection.organizationId,
                outcome: decision.applied
                  ? WhatsAppStatusWebhookOutcome.APPLIED
                  : WhatsAppStatusWebhookOutcome.IGNORED,
                payloadHash,
                payloadRedactedJson: this.redacted(event.status),
                processedAt: now,
                providerMessageIdHash,
                receivedAt: now,
                rejectionReason: decision.reason,
                storeId: command.storeId,
              },
            });
            if (decision.applied) {
              await transaction.whatsAppMessage.update({
                data: this.statusUpdate(observedStatus, occurredAt),
                where: { id: message.id },
              });
            }
            await transaction.whatsAppMessageStatusHistory.create({
              data: {
                applied: decision.applied,
                fromStatus: currentStatus,
                messageId: message.id,
                observedStatus,
                occurredAt,
                organizationId: connection.organizationId,
                reasonCode: decision.reason,
                resultingStatus: decision.resultingStatus,
                storeId: command.storeId,
                webhookEventId: eventId,
              },
            });
            if (decision.applied) {
              await transaction.outboxEvent.create({
                data: {
                  aggregateId: message.id,
                  aggregateType: 'whatsapp_message',
                  causationId: event.externalEventId,
                  correlationId,
                  eventType: 'whatsapp.message.simulated-status-updated.v1',
                  organizationId: connection.organizationId,
                  payloadJson: {
                    messageId: message.id,
                    mode: 'simulation',
                    status: event.status,
                    storeId: command.storeId,
                    webhookEventId: eventId,
                  },
                },
              });
            }
            await transaction.auditLog.create({
              data: {
                action: decision.applied
                  ? 'whatsapp.status_webhook.applied'
                  : 'whatsapp.status_webhook.ignored',
                correlationId,
                metadataJson: {
                  mode: 'simulation',
                  observedStatus: event.status,
                  reason: decision.reason,
                },
                organizationId: connection.organizationId,
                outcome: 'SUCCESS',
                resourceId: eventId,
                resourceType: 'whatsapp_status_webhook_event',
              },
            });
            return this.result(
              eventId,
              message.id,
              observedStatus,
              decision.applied
                ? WhatsAppStatusWebhookOutcome.APPLIED
                : WhatsAppStatusWebhookOutcome.IGNORED,
              decision.reason,
              false,
            );
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordWhatsAppStatusWebhook(result.outcome);
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.findReplay(command.storeId, event.externalEventId, payloadHash);
        if (replay !== null) return replay;
      }
      this.metrics.recordWhatsAppStatusWebhook('failure');
      throw error;
    }
  }

  private assertEnabled(): void {
    const integration = this.environment.whatsapp;
    const webhooks = this.environment.whatsappWebhooks;
    if (
      !integration.enabled ||
      integration.killSwitch ||
      !integration.simulationMode ||
      !webhooks.enabled ||
      webhooks.killSwitch ||
      !webhooks.simulationMode
    ) {
      throw new ServiceUnavailableException('WhatsApp status webhook simulation is disabled');
    }
  }

  private async findReplay(
    storeId: string,
    externalEventId: string,
    payloadHash: string,
  ): Promise<WhatsAppStatusResult | null> {
    const existing = await this.prisma.whatsAppStatusWebhookEvent.findUnique({
      where: { storeId_externalEventId: { externalEventId, storeId } },
    });
    if (existing === null) return null;
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException('WhatsApp event ID was reused with another payload');
    }
    this.metrics.recordWhatsAppStatusWebhook('duplicate');
    return this.result(
      existing.id,
      existing.messageId,
      existing.observedStatus,
      existing.outcome,
      existing.rejectionReason,
      true,
    );
  }

  private parse(rawBody: Buffer): ReturnType<typeof whatsappStatusWebhookSchema.parse> {
    let value: unknown;
    try {
      value = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Invalid WhatsApp webhook JSON');
    }
    const parsed = whatsappStatusWebhookSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(
        'Only versioned synthetic WhatsApp status fixtures are accepted',
      );
    }
    return parsed.data;
  }

  private redacted(status: string): Prisma.InputJsonValue {
    return { fixtureVersion: 'v1', mode: 'simulation', status, synthetic: true };
  }

  private statusUpdate(
    status: WhatsAppInternalStatus,
    occurredAt: Date,
  ): Prisma.WhatsAppMessageUpdateInput {
    switch (status) {
      case 'SIMULATED_DELIVERED':
        return { deliveredAt: occurredAt, status: WhatsAppMessageStatus.SIMULATED_DELIVERED };
      case 'SIMULATED_FAILED':
        return { failedAt: occurredAt, status: WhatsAppMessageStatus.SIMULATED_FAILED };
      case 'SIMULATED_READ':
        return { readAt: occurredAt, status: WhatsAppMessageStatus.SIMULATED_READ };
      case 'SIMULATED_SENT':
        return { sentAt: occurredAt, status: WhatsAppMessageStatus.SIMULATED_SENT };
      case 'SIMULATED_ACCEPTED':
        throw new Error('Accepted is not a webhook-observed status');
    }
  }

  private result(
    eventId: string,
    messageId: string | null,
    observedStatus: WhatsAppMessageStatus,
    outcome: WhatsAppStatusWebhookOutcome,
    reason: string | null,
    duplicate: boolean,
  ): WhatsAppStatusResult {
    const normalizedStatus = observedStatus.toLowerCase() as WhatsAppStatusResult['observedStatus'];
    let normalizedOutcome: StatusOutcome;
    if (outcome === WhatsAppStatusWebhookOutcome.APPLIED) normalizedOutcome = 'applied';
    else if (reason === 'unknown_message') normalizedOutcome = 'ignored_unknown_message';
    else if (reason === 'terminal_state') normalizedOutcome = 'ignored_terminal_state';
    else if (reason === 'duplicate_status') normalizedOutcome = 'ignored_duplicate_status';
    else normalizedOutcome = 'ignored_out_of_order';
    return {
      accepted: true,
      duplicate,
      eventId,
      messageId,
      mode: 'simulation',
      observedStatus: normalizedStatus,
      outcome: normalizedOutcome,
    };
  }

  private sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async recordRejected(
    organizationId: string,
    storeId: string,
    reason: string,
  ): Promise<void> {
    this.metrics.recordWhatsAppStatusWebhook(reason);
    await this.audit.record({
      action: 'whatsapp.status_webhook.rejected',
      metadata: { mode: 'simulation', reason },
      organizationId,
      outcome: 'FAILURE',
      resourceId: storeId,
      resourceType: 'whatsapp_connection',
    });
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSerializationConflict(error) || retry === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
      }
    }
    throw new Error('Serializable transaction retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    const metadata = error.meta as { code?: string } | undefined;
    return (
      error.code === 'P2010' && (metadata?.code === '40001' || error.message.includes('40001'))
    );
  }
}
