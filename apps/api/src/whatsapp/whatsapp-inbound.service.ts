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
  WhatsAppInboundIdentityResolution,
  WhatsAppInboundWebhookOutcome,
  WhatsAppMessageDirection,
  WhatsAppMessageStatus,
  WhatsAppMessageType,
} from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import { WhatsAppCredentialCipher } from './whatsapp-credential-cipher';
import { whatsappInboundWebhookSchema } from './whatsapp-inbound.contract';
import { verifySimulatedWhatsAppStatusSignature } from './whatsapp-status-signature';

interface ReceiveCommand {
  readonly rawBody: Buffer;
  readonly signature: string;
  readonly storeId: string;
}

export interface WhatsAppInboundResult {
  readonly accepted: true;
  readonly conversationId: string;
  readonly duplicate: boolean;
  readonly eventId: string;
  readonly messageId: string;
  readonly mode: 'simulation';
  readonly status: 'simulated_received';
}

@Injectable()
export class WhatsAppInboundService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: WhatsAppCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  public async receive(command: ReceiveCommand): Promise<WhatsAppInboundResult> {
    this.assertEnabled();
    if (command.rawBody.length === 0) throw new BadRequestException('Webhook body is required');
    if (command.rawBody.length > this.environment.whatsappWebhooks.maxBodyBytes) {
      this.metrics.recordWhatsAppInboundWebhook('body_too_large');
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
      this.metrics.recordWhatsAppInboundWebhook('target_unavailable');
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

    const providerMessageIdHash = this.sha256Text(event.providerMessageId);
    const senderPseudonyms = this.cipher.pseudonymizeInboundSender(
      event.senderPhoneE164,
      connection.organizationId,
      command.storeId,
    );
    const senderHash = senderPseudonyms.current;
    const contentFingerprint = this.cipher.fingerprintInboundContent(
      event.message.text,
      connection.organizationId,
      command.storeId,
    );
    const requestFingerprint = this.sha256Text(
      `${event.providerMessageId}\u0000${event.senderPhoneE164}\u0000${event.message.text}`,
    );
    const businessKeyHash = this.sha256Text(
      `inbound:${connection.organizationId}:${command.storeId}:${event.providerMessageId}`,
    );

    try {
      const result = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'whatsapp.inbound:' + command.storeId + ':' + providerMessageIdHash}, 0)
              )
            `;
            const replay = await transaction.whatsAppInboundWebhookEvent.findUnique({
              where: {
                storeId_externalEventId: {
                  externalEventId: event.externalEventId,
                  storeId: command.storeId,
                },
              },
            });
            if (replay !== null) {
              if (replay.payloadHash !== payloadHash) {
                throw new ConflictException(
                  'WhatsApp inbound event ID was reused with another payload',
                );
              }
              return this.result(replay.id, replay.messageId, replay.conversationId, true);
            }

            const existingMessage = await transaction.whatsAppMessage.findUnique({
              where: {
                storeId_providerMessageId: {
                  providerMessageId: event.providerMessageId,
                  storeId: command.storeId,
                },
              },
            });
            const now = new Date();
            const occurredAt = new Date(event.occurredAt);
            const correlationId = this.requestContext.correlationId ?? randomUUID();
            if (existingMessage !== null) {
              if (
                existingMessage.direction !== WhatsAppMessageDirection.INBOUND ||
                existingMessage.requestFingerprint !== requestFingerprint
              ) {
                throw new ConflictException(
                  'WhatsApp provider message ID was reused with another payload',
                );
              }
              const original = await transaction.whatsAppInboundWebhookEvent.findFirst({
                orderBy: { receivedAt: 'asc' },
                where: { messageId: existingMessage.id },
              });
              if (original === null) {
                throw new ServiceUnavailableException('Inbound message evidence is incomplete');
              }
              const duplicateEvent = await transaction.whatsAppInboundWebhookEvent.create({
                data: {
                  contentLength: event.message.text.length,
                  conversationId: existingMessage.conversationId,
                  eventType: event.eventType,
                  externalEventId: event.externalEventId,
                  fixtureVersion: event._fixture.version,
                  identityResolution: original.identityResolution,
                  messageId: existingMessage.id,
                  occurredAt,
                  organizationId: connection.organizationId,
                  outcome: WhatsAppInboundWebhookOutcome.DUPLICATE,
                  payloadHash,
                  payloadRedactedJson: this.redacted(event.message.text.length),
                  processedAt: now,
                  providerMessageIdHash,
                  receivedAt: now,
                  senderHash,
                  storeId: command.storeId,
                },
              });
              await transaction.auditLog.create({
                data: {
                  action: 'whatsapp.inbound_webhook.duplicate',
                  correlationId,
                  metadataJson: { mode: 'simulation', outcome: 'duplicate' },
                  organizationId: connection.organizationId,
                  outcome: 'SUCCESS',
                  resourceId: duplicateEvent.id,
                  resourceType: 'whatsapp_inbound_webhook_event',
                },
              });
              return this.result(
                duplicateEvent.id,
                existingMessage.id,
                existingMessage.conversationId,
                true,
              );
            }

            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'whatsapp.inbound-contact:' + command.storeId + ':' + senderHash}, 0)
              )
            `;
            const customers = await transaction.customer.findMany({
              take: 2,
              where: {
                organizationId: connection.organizationId,
                phoneE164: event.senderPhoneE164,
                storeId: command.storeId,
              },
            });
            if (customers.length > 1) {
              throw new ConflictException('WhatsApp sender identity is ambiguous');
            }
            const customer = customers[0] ?? null;
            const matchingContacts = await transaction.whatsAppConversation.findMany({
              take: 2,
              where: {
                contactHash: { in: [...senderPseudonyms.candidates] },
                organizationId: connection.organizationId,
                storeId: command.storeId,
              },
            });
            if (matchingContacts.length > 1) {
              throw new ConflictException('WhatsApp sender maps to conflicting conversations');
            }
            const byContact = matchingContacts[0] ?? null;
            const byPhone =
              customer === null
                ? null
                : await transaction.whatsAppConversation.findUnique({
                    where: {
                      storeId_phoneE164: {
                        phoneE164: event.senderPhoneE164,
                        storeId: command.storeId,
                      },
                    },
                  });
            if (byContact !== null && byPhone !== null && byContact.id !== byPhone.id) {
              throw new ConflictException('WhatsApp sender maps to conflicting conversations');
            }
            let conversation = byContact ?? byPhone;
            if (
              conversation !== null &&
              customer !== null &&
              conversation.customerId !== null &&
              conversation.customerId !== customer.id
            ) {
              throw new ConflictException('WhatsApp sender is linked to another customer');
            }
            const lastMessageAt =
              conversation !== null && conversation.lastMessageAt > occurredAt
                ? conversation.lastMessageAt
                : occurredAt;
            if (conversation === null) {
              conversation = await transaction.whatsAppConversation.create({
                data: {
                  contactHash: senderHash,
                  customerId: customer?.id ?? null,
                  lastMessageAt,
                  organizationId: connection.organizationId,
                  phoneE164: customer === null ? null : event.senderPhoneE164,
                  storeId: command.storeId,
                },
              });
            } else {
              const conversationUpdate: Prisma.WhatsAppConversationUncheckedUpdateInput = {
                contactHash: senderHash,
                lastMessageAt,
                status: 'OPEN',
              };
              if (conversation.customerId === null && customer !== null) {
                conversationUpdate.customerId = customer.id;
                conversationUpdate.phoneE164 = event.senderPhoneE164;
              }
              conversation = await transaction.whatsAppConversation.update({
                data: conversationUpdate,
                where: { id: conversation.id },
              });
            }
            const identityResolution =
              customer !== null || conversation.customerId !== null
                ? WhatsAppInboundIdentityResolution.KNOWN_CUSTOMER
                : WhatsAppInboundIdentityResolution.UNKNOWN_CONTACT;
            const messageId = randomUUID();
            const retentionExpiresAt = new Date(
              now.getTime() +
                this.environment.whatsappInbound.contentRetentionDays * 24 * 60 * 60 * 1000,
            );
            const encryptedBodyJson = this.cipher.encryptInboundMessageContent(
              event.message.text,
              connection.organizationId,
              command.storeId,
              messageId,
            );
            const message = await transaction.whatsAppMessage.create({
              data: {
                businessKeyHash,
                contentFingerprint,
                conversationId: conversation.id,
                direction: WhatsAppMessageDirection.INBOUND,
                encryptedBodyJson: { ...encryptedBodyJson },
                id: messageId,
                metadataJson: {
                  contentEncrypted: true,
                  fixtureVersion: event._fixture.version,
                  messageType: 'text',
                  mode: 'simulation',
                  retentionDays: this.environment.whatsappInbound.contentRetentionDays,
                },
                organizationId: connection.organizationId,
                providerMessageId: event.providerMessageId,
                receivedAt: now,
                requestFingerprint,
                retentionExpiresAt,
                senderHash,
                status: WhatsAppMessageStatus.SIMULATED_RECEIVED,
                storeId: command.storeId,
                type: WhatsAppMessageType.TEXT,
              },
            });
            const inboundEvent = await transaction.whatsAppInboundWebhookEvent.create({
              data: {
                contentLength: event.message.text.length,
                conversationId: conversation.id,
                eventType: event.eventType,
                externalEventId: event.externalEventId,
                fixtureVersion: event._fixture.version,
                identityResolution,
                messageId: message.id,
                occurredAt,
                organizationId: connection.organizationId,
                outcome: WhatsAppInboundWebhookOutcome.ACCEPTED,
                payloadHash,
                payloadRedactedJson: this.redacted(event.message.text.length),
                processedAt: now,
                providerMessageIdHash,
                receivedAt: now,
                senderHash,
                storeId: command.storeId,
              },
            });
            await transaction.outboxEvent.create({
              data: {
                aggregateId: message.id,
                aggregateType: 'whatsapp_message',
                causationId: inboundEvent.id,
                correlationId,
                eventType: 'whatsapp.message.simulated-received.v1',
                organizationId: connection.organizationId,
                payloadJson: {
                  conversationId: conversation.id,
                  messageId: message.id,
                  messageType: 'text',
                  mode: 'simulation',
                  status: 'simulated_received',
                  storeId: command.storeId,
                  webhookEventId: inboundEvent.id,
                },
              },
            });
            await transaction.auditLog.create({
              data: {
                action: 'whatsapp.inbound_webhook.accepted',
                correlationId,
                metadataJson: {
                  messageType: 'text',
                  mode: 'simulation',
                  status: 'simulated_received',
                },
                organizationId: connection.organizationId,
                outcome: 'SUCCESS',
                resourceId: inboundEvent.id,
                resourceType: 'whatsapp_inbound_webhook_event',
              },
            });
            return this.result(inboundEvent.id, message.id, conversation.id, false);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordWhatsAppInboundWebhook(result.duplicate ? 'duplicate' : 'accepted');
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.findReplay(command.storeId, event.externalEventId, payloadHash);
        if (replay !== null) return replay;
      }
      this.metrics.recordWhatsAppInboundWebhook('failure');
      throw error;
    }
  }

  private assertEnabled(): void {
    const integration = this.environment.whatsapp;
    const webhooks = this.environment.whatsappWebhooks;
    const inbound = this.environment.whatsappInbound;
    if (
      !integration.enabled ||
      integration.killSwitch ||
      !integration.simulationMode ||
      !webhooks.enabled ||
      webhooks.killSwitch ||
      !webhooks.simulationMode ||
      !inbound.enabled ||
      inbound.killSwitch ||
      !inbound.simulationMode
    ) {
      throw new ServiceUnavailableException('WhatsApp inbound simulation is disabled');
    }
  }

  private async findReplay(
    storeId: string,
    externalEventId: string,
    payloadHash: string,
  ): Promise<WhatsAppInboundResult | null> {
    const existing = await this.prisma.whatsAppInboundWebhookEvent.findUnique({
      where: { storeId_externalEventId: { externalEventId, storeId } },
    });
    if (existing === null) return null;
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException('WhatsApp inbound event ID was reused with another payload');
    }
    this.metrics.recordWhatsAppInboundWebhook('duplicate');
    return this.result(existing.id, existing.messageId, existing.conversationId, true);
  }

  private parse(rawBody: Buffer): ReturnType<typeof whatsappInboundWebhookSchema.parse> {
    let value: unknown;
    try {
      value = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Invalid WhatsApp webhook JSON');
    }
    const parsed = whatsappInboundWebhookSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(
        'Only versioned synthetic WhatsApp inbound message fixtures are accepted',
      );
    }
    return parsed.data;
  }

  private redacted(contentLength: number): Prisma.InputJsonValue {
    return {
      contentLength,
      fixtureVersion: 'v1',
      messageType: 'text',
      mode: 'simulation',
      synthetic: true,
    };
  }

  private result(
    eventId: string,
    messageId: string,
    conversationId: string,
    duplicate: boolean,
  ): WhatsAppInboundResult {
    return {
      accepted: true,
      conversationId,
      duplicate,
      eventId,
      messageId,
      mode: 'simulation',
      status: 'simulated_received',
    };
  }

  private sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private sha256Text(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private async recordRejected(
    organizationId: string,
    storeId: string,
    reason: string,
  ): Promise<void> {
    this.metrics.recordWhatsAppInboundWebhook(reason);
    await this.audit.record({
      action: 'whatsapp.inbound_webhook.rejected',
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
