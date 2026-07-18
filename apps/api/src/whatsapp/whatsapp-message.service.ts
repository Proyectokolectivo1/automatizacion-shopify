import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { hashSensitive } from '../auth/token';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import { WhatsAppCredentialCipher } from './whatsapp-credential-cipher';
import { renderWhatsAppTemplate, type WhatsAppMessageVariables } from './whatsapp-message.contract';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp-provider';

interface DispatchCommand {
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly languageCode: string;
  readonly orderId: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly storeId: string;
  readonly variables: WhatsAppMessageVariables;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

const connectionConfigSchema = z.object({
  apiVersion: z.string(),
  businessAccountId: z.string(),
  fixtureVersion: z.string(),
  mode: z.literal('simulation'),
  phoneNumberId: z.string(),
});

export interface WhatsAppMessageResult {
  readonly conversationId: string;
  readonly createdAt: string;
  readonly eventType: string;
  readonly languageCode: string;
  readonly messageId: string;
  readonly mode: 'simulation';
  readonly orderId: string;
  readonly outcome: 'simulated_accepted';
  readonly providerMessageId: string;
  readonly status: 'simulated_accepted';
  readonly storeId: string;
  readonly templateId: string;
  readonly templateVersion: number;
}

const DISPATCH_SCOPE = 'whatsapp.message.transactional.dispatch';

@Injectable()
export class WhatsAppMessageService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: WhatsAppCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  public async dispatch(command: DispatchCommand): Promise<WhatsAppMessageResult> {
    this.assertEnabled();
    const httpRequestHash = requestHash({
      eventType: command.eventType,
      languageCode: command.languageCode,
      orderId: command.orderId,
      organizationId: command.organizationId,
      storeId: command.storeId,
      variables: command.variables,
    });
    const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
    try {
      const transactionResult = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
              VALUES (${DISPATCH_SCOPE}, ${storedKey}, ${httpRequestHash}, NOW() + INTERVAL '24 hours')
              ON CONFLICT (scope, key) DO NOTHING
            `;
            const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
              SELECT request_hash, response_snapshot_json, status
              FROM idempotency_keys
              WHERE scope = ${DISPATCH_SCOPE} AND key = ${storedKey}
              FOR UPDATE
            `;
            if (record === undefined) throw new Error('Idempotency record could not be locked');
            if (record.request_hash !== httpRequestHash) {
              throw new ConflictException('Idempotency key was already used with another request');
            }
            if (record.status === 'completed' && record.response_snapshot_json !== null) {
              return {
                replayed: true,
                result: record.response_snapshot_json as unknown as WhatsAppMessageResult,
              };
            }
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'whatsapp.message:' + command.organizationId + ':' + command.storeId + ':' + command.eventType + ':' + command.orderId}, 0)
              )
            `;
            const connection = await transaction.integrationConnection.findFirst({
              where: {
                lastHealthStatus: 'HEALTHY',
                organizationId: command.organizationId,
                provider: 'WHATSAPP',
                status: 'ACTIVE',
                storeId: command.storeId,
              },
            });
            if (connection === null) {
              throw new ConflictException('An active healthy WhatsApp connection is required');
            }
            const config = connectionConfigSchema.safeParse(connection.configJson);
            if (!config.success) {
              throw new ServiceUnavailableException('WhatsApp connection configuration is invalid');
            }
            const order = await transaction.order.findFirst({
              include: { customer: true },
              where: {
                id: command.orderId,
                organizationId: command.organizationId,
                storeId: command.storeId,
              },
            });
            if (order === null) throw new NotFoundException('Order not found');
            if (
              order.customer === null ||
              order.customer.phoneE164 === null ||
              !order.customer.dataProcessingConsent ||
              !/^\+[1-9][0-9]{7,14}$/u.test(order.customer.phoneE164)
            ) {
              throw new ConflictException('Order customer is not eligible for WhatsApp messaging');
            }
            const template = await transaction.whatsAppTemplate.findFirst({
              where: {
                active: true,
                eventType: command.eventType,
                languageCode: command.languageCode,
                organizationId: command.organizationId,
                status: 'SIMULATED_APPROVED',
                storeId: command.storeId,
              },
            });
            if (template === null) {
              throw new ConflictException('An active simulated WhatsApp template is required');
            }
            let rendered: ReturnType<typeof renderWhatsAppTemplate>;
            try {
              rendered = renderWhatsAppTemplate(
                template.bodyTemplate,
                template.variablesSchemaJson,
                command.variables,
              );
            } catch {
              throw new BadRequestException('Invalid WhatsApp template variables');
            }
            const businessKeyHash = hashSensitive(
              `whatsapp:${command.organizationId}:${command.storeId}:${command.eventType}:${command.orderId}:${template.version}`,
            );
            const fingerprint = requestHash({
              body: rendered.body,
              orderId: order.id,
              templateId: template.id,
              variables: command.variables,
            });
            const existing = await transaction.whatsAppMessage.findUnique({
              include: { template: true },
              where: { businessKeyHash },
            });
            if (existing !== null) {
              if (existing.requestFingerprint !== fingerprint) {
                throw new ConflictException(
                  'WhatsApp business message already has other variables',
                );
              }
              const result = this.result(existing, existing.template);
              await this.completeIdempotency(transaction, storedKey, result);
              return { replayed: true, result };
            }
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'whatsapp.conversation:' + command.organizationId + ':' + command.storeId + ':' + order.customer.phoneE164}, 0)
              )
            `;
            const accessToken = this.cipher.decrypt(
              connection.encryptedCredentialsJson,
              command.organizationId,
              command.storeId,
            );
            const providerResult = await this.provider.dispatchTemplate({
              accessToken,
              apiVersion: config.data.apiVersion,
              businessKeyHash,
              languageCode: command.languageCode,
              parameters: rendered.parameters,
              phoneNumberId: config.data.phoneNumberId,
              recipientPhoneE164: order.customer.phoneE164,
              templateName: template.metaTemplateName,
            });
            if (!providerResult.accepted || providerResult.mode !== 'simulation') {
              throw new ServiceUnavailableException(
                'WhatsApp simulation did not accept the message',
              );
            }
            const now = new Date();
            let conversation = await transaction.whatsAppConversation.findUnique({
              where: {
                storeId_phoneE164: {
                  phoneE164: order.customer.phoneE164,
                  storeId: command.storeId,
                },
              },
            });
            if (conversation !== null && conversation.customerId !== order.customer.id) {
              throw new ConflictException('WhatsApp phone is linked to another customer');
            }
            conversation ??= await transaction.whatsAppConversation.create({
              data: {
                customerId: order.customer.id,
                lastMessageAt: now,
                organizationId: command.organizationId,
                phoneE164: order.customer.phoneE164,
                storeId: command.storeId,
              },
            });
            const message = await transaction.whatsAppMessage.create({
              data: {
                body: rendered.body,
                businessKeyHash,
                conversationId: conversation.id,
                id: randomUUID(),
                metadataJson: {
                  fixtureVersion: providerResult.fixtureVersion,
                  languageCode: command.languageCode,
                  mode: 'simulation',
                  templateVersion: template.version,
                  variableNames: rendered.variableNames,
                },
                orderId: order.id,
                organizationId: command.organizationId,
                providerMessageId: providerResult.providerMessageId,
                requestFingerprint: fingerprint,
                storeId: command.storeId,
                templateId: template.id,
              },
            });
            await transaction.whatsAppConversation.update({
              data: { lastMessageAt: now, status: 'OPEN' },
              where: { id: conversation.id },
            });
            const result = this.result(message, template);
            const correlationId = this.requestContext.correlationId ?? 'internal';
            await transaction.outboxEvent.create({
              data: {
                aggregateId: message.id,
                aggregateType: 'whatsapp_message',
                correlationId,
                eventType: 'whatsapp.message.simulated-accepted.v1',
                organizationId: command.organizationId,
                payloadJson: {
                  conversationId: conversation.id,
                  messageId: message.id,
                  mode: 'simulation',
                  orderId: order.id,
                  status: 'simulated_accepted',
                  storeId: command.storeId,
                  templateId: template.id,
                  templateVersion: template.version,
                },
              },
            });
            await this.completeIdempotency(transaction, storedKey, result);
            await transaction.auditLog.create({
              data: {
                action: 'whatsapp.message.simulated_accepted',
                actorUserId: command.principal.userId,
                correlationId,
                metadataJson: {
                  mode: 'simulation',
                  status: 'simulated_accepted',
                  templateVersion: template.version,
                },
                organizationId: command.organizationId,
                outcome: 'SUCCESS',
                resourceId: message.id,
                resourceType: 'whatsapp_message',
              },
            });
            return { replayed: false, result };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordWhatsAppMessageOperation(
        transactionResult.replayed ? 'dispatch.replayed' : 'dispatch',
        'success',
      );
      return transactionResult.result;
    } catch (error) {
      this.metrics.recordWhatsAppMessageOperation('dispatch', 'failure');
      await this.audit.record({
        action: 'whatsapp.message.dispatch_failed',
        actorUserId: command.principal.userId,
        metadata: { mode: 'simulation' },
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: command.orderId,
        resourceType: 'whatsapp_message',
      });
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2003')
      ) {
        throw new ConflictException('WhatsApp message conflicts with an existing record');
      }
      throw error;
    }
  }

  private completeIdempotency(
    transaction: Prisma.TransactionClient,
    storedKey: string,
    result: WhatsAppMessageResult,
  ) {
    return transaction.idempotencyKey.update({
      data: { responseSnapshotJson: { ...result }, status: IdempotencyStatus.COMPLETED },
      where: { scope_key: { key: storedKey, scope: DISPATCH_SCOPE } },
    });
  }

  private assertEnabled(): void {
    const controls = this.environment.whatsappMessages;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new ServiceUnavailableException('WhatsApp message simulation is disabled');
    }
  }

  private result(
    message: {
      conversationId: string;
      createdAt: Date;
      id: string;
      orderId: string | null;
      providerMessageId: string;
      storeId: string;
      templateId: string | null;
    },
    template: { eventType: string; languageCode: string; version: number } | null,
  ): WhatsAppMessageResult {
    if (message.orderId === null || message.templateId === null || template === null) {
      throw new ServiceUnavailableException('Outbound WhatsApp message evidence is incomplete');
    }
    return {
      conversationId: message.conversationId,
      createdAt: message.createdAt.toISOString(),
      eventType: template.eventType,
      languageCode: template.languageCode,
      messageId: message.id,
      mode: 'simulation',
      orderId: message.orderId,
      outcome: 'simulated_accepted',
      providerMessageId: message.providerMessageId,
      status: 'simulated_accepted',
      storeId: message.storeId,
      templateId: message.templateId,
      templateVersion: template.version,
    };
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
