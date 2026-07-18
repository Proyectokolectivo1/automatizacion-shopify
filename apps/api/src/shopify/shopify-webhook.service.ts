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
import { z } from 'zod';

import { AuditService } from '../auth/audit.service';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import { ShopifyCredentialCipher } from './shopify-credential-cipher';
import { normalizeShopifyDomain } from './shopify-domain';
import { verifyShopifyWebhookHmac } from './shopify-webhook-signature';

const simulatedOrderSchema = z
  .object({
    _fixture: z.object({ synthetic: z.literal(true), version: z.literal('v1') }),
    id: z.union([z.number().int().safe(), z.string().trim().min(1).max(64)]),
    test: z.literal(true),
  })
  .passthrough();
const liveOrderSchema = z
  .object({
    id: z.union([z.number().int().safe(), z.string().trim().min(1).max(128)]),
    test: z.boolean().optional(),
  })
  .passthrough();

interface VerifiedPayload {
  readonly providerResourceId: string;
  readonly sourceVersion: string;
  readonly synthetic: boolean;
}

export interface ShopifyWebhookCommand {
  readonly apiVersion: string;
  readonly hmac: string;
  readonly rawBody: Buffer;
  readonly shopDomain: string;
  readonly storeId: string;
  readonly topic: 'orders/create';
  readonly triggeredAt: string;
  readonly webhookId: string;
}

export interface ShopifyWebhookResult {
  readonly accepted: true;
  readonly duplicate: boolean;
  readonly eventId: string;
  readonly mode: 'live' | 'simulation';
}

@Injectable()
export class ShopifyWebhookService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: ShopifyCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  public async receive(command: ShopifyWebhookCommand): Promise<ShopifyWebhookResult> {
    this.assertEnabled();
    if (command.rawBody.length === 0) throw new BadRequestException('Webhook body is required');
    if (command.rawBody.length > this.environment.shopifyWebhooks.maxBodyBytes) {
      this.metrics.recordShopifyWebhook(command.topic, 'body_too_large');
      throw new PayloadTooLargeException('Webhook body exceeds the configured limit');
    }

    const shopDomain = normalizeShopifyDomain(command.shopDomain);
    const connection = await this.prisma.integrationConnection.findFirst({
      include: { store: true },
      where: {
        encryptedWebhookSecretJson: { not: Prisma.DbNull },
        provider: 'SHOPIFY',
        status: 'ACTIVE',
        store: { status: 'ACTIVE' },
        storeId: command.storeId,
      },
    });
    if (connection === null || connection.encryptedWebhookSecretJson === null) {
      this.metrics.recordShopifyWebhook(command.topic, 'store_unavailable');
      throw new NotFoundException('Shopify webhook target not found');
    }
    if (connection.store.shopifyShopDomain !== shopDomain) {
      await this.recordFailure(connection.organizationId, command.storeId, 'domain_mismatch');
      throw new UnauthorizedException('Invalid Shopify webhook');
    }

    const secrets = this.cipher.decryptWebhookSecrets(
      connection.encryptedWebhookSecretJson,
      connection.organizationId,
      command.storeId,
    );
    if (
      !secrets.some((secret) => verifyShopifyWebhookHmac(command.rawBody, command.hmac, secret))
    ) {
      await this.recordFailure(connection.organizationId, command.storeId, 'invalid_signature');
      throw new UnauthorizedException('Invalid Shopify webhook');
    }

    const triggeredAt = new Date(command.triggeredAt);
    if (Number.isNaN(triggeredAt.valueOf())) {
      await this.recordFailure(connection.organizationId, command.storeId, 'invalid_timestamp');
      throw new BadRequestException('Invalid Shopify webhook timestamp');
    }

    const payload = this.parseVerifiedPayload(command.rawBody, command.apiVersion);
    const payloadHash = this.sha256(command.rawBody);
    const correlationId = this.requestContext.correlationId ?? randomUUID();
    const eventId = randomUUID();
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.webhookEvent.create({
          data: {
            apiVersion: command.apiVersion,
            eventType: command.topic,
            externalEventId: command.webhookId,
            headersRedactedJson: {
              apiVersion: command.apiVersion,
              domainHash: this.sha256(Buffer.from(shopDomain, 'utf8')),
              triggeredAt: command.triggeredAt,
              webhookIdHash: this.sha256(Buffer.from(command.webhookId, 'utf8')),
            },
            id: eventId,
            organizationId: connection.organizationId,
            payloadHash,
            providerResourceId: payload.providerResourceId,
            payloadRedactedJson: {
              providerResourceIdHash: this.sha256(Buffer.from(payload.providerResourceId, 'utf8')),
              sourceVersion: payload.sourceVersion,
              synthetic: payload.synthetic,
            },
            provider: 'SHOPIFY',
            signatureValid: true,
            storeId: command.storeId,
            triggeredAt,
          },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateId: eventId,
            aggregateType: 'webhook_event',
            causationId: command.webhookId,
            correlationId,
            eventType: 'shopify.webhook.received.v1',
            eventVersion: 1,
            organizationId: connection.organizationId,
            payloadJson: {
              mode: this.mode,
              provider: 'shopify',
              sourceVersion: payload.sourceVersion,
              storeId: command.storeId,
              topic: command.topic,
              webhookEventId: eventId,
            },
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'shopify.webhook.received',
            correlationId,
            metadataJson: { mode: this.mode, topic: command.topic },
            organizationId: connection.organizationId,
            outcome: 'SUCCESS',
            resourceId: eventId,
            resourceType: 'webhook_event',
          },
        });
      });
      this.metrics.recordShopifyWebhook(command.topic, 'accepted');
      return { accepted: true, duplicate: false, eventId, mode: this.mode };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        this.metrics.recordShopifyWebhook(command.topic, 'failed');
        throw error;
      }
      const existing = await this.prisma.webhookEvent.findUnique({
        where: {
          storeId_eventType_externalEventId: {
            eventType: command.topic,
            externalEventId: command.webhookId,
            storeId: command.storeId,
          },
        },
      });
      if (existing === null) throw error;
      if (existing.payloadHash !== payloadHash) {
        await this.recordFailure(connection.organizationId, command.storeId, 'conflicting_replay');
        throw new ConflictException('Webhook delivery ID was reused with a different payload');
      }
      this.metrics.recordShopifyWebhook(command.topic, 'duplicate');
      return { accepted: true, duplicate: true, eventId: existing.id, mode: this.mode };
    }
  }

  private parseVerifiedPayload(rawBody: Buffer, apiVersion: string): VerifiedPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Invalid Shopify webhook JSON');
    }
    if (this.mode === 'simulation') {
      const result = simulatedOrderSchema.safeParse(parsed);
      if (!result.success) {
        throw new BadRequestException('Only versioned synthetic Shopify fixtures are accepted');
      }
      return {
        providerResourceId: String(result.data.id),
        sourceVersion: result.data._fixture.version,
        synthetic: true,
      };
    }
    if (typeof parsed === 'object' && parsed !== null && Object.hasOwn(parsed, '_fixture')) {
      throw new BadRequestException('Synthetic Shopify payload is not accepted in live mode');
    }
    const result = liveOrderSchema.safeParse(parsed);
    if (!result.success) throw new BadRequestException('Invalid Shopify order webhook payload');
    return {
      providerResourceId: String(result.data.id),
      sourceVersion: apiVersion,
      synthetic: false,
    };
  }

  private assertEnabled(): void {
    const controls = this.environment.shopifyWebhooks;
    if (!controls.enabled || controls.killSwitch) {
      throw new ServiceUnavailableException('Shopify webhook ingress is disabled');
    }
  }

  private sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async recordFailure(
    organizationId: string,
    storeId: string,
    reason: string,
  ): Promise<void> {
    this.metrics.recordShopifyWebhook('orders/create', reason);
    await this.audit.record({
      action: 'shopify.webhook.rejected',
      metadata: { mode: this.mode, reason, topic: 'orders/create' },
      organizationId,
      outcome: 'FAILURE',
      resourceId: storeId,
      resourceType: 'shopify_store',
    });
  }

  private get mode(): 'live' | 'simulation' {
    return this.environment.shopify.simulationMode ? 'simulation' : 'live';
  }
}
