import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { hashSensitive } from '../auth/token';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import { DEFAULT_ORDER_CLASSIFICATION_POLICY } from '../orders/order-classification-policy';
import { ShopifyCredentialCipher } from './shopify-credential-cipher';
import { normalizeShopifyDomain } from './shopify-domain';
import { SHOPIFY_PROVIDER, type ShopifyProvider } from './shopify-provider';

interface BaseCommand {
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
}

interface RegisterCommand extends BaseCommand {
  readonly accessToken: string;
  readonly currency: string;
  readonly displayName: string;
  readonly name: string;
  readonly shopDomain: string;
  readonly timezone: string;
}

interface StoreCommand extends BaseCommand {
  readonly storeId: string;
}

interface RotateCommand extends StoreCommand {
  readonly accessToken: string;
}

interface ConfigureWebhookSecretCommand extends StoreCommand {
  readonly webhookSecret: string;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

export interface ShopifyStoreResult {
  readonly health: 'healthy' | 'unknown' | 'unhealthy';
  readonly mode: 'live' | 'simulation';
  readonly shopDomain: string;
  readonly status: 'active' | 'disabled' | 'error' | 'pending' | 'tested';
  readonly storeId: string;
}

const REGISTER_SCOPE = 'shopify.store.register';
const TEST_SCOPE = 'shopify.store.test';
const ACTIVATE_SCOPE = 'shopify.store.activate';
const DEACTIVATE_SCOPE = 'shopify.store.deactivate';
const ROTATE_SCOPE = 'shopify.store.credentials.rotate';
const WEBHOOK_SECRET_SCOPE = 'shopify.store.webhook-secret.configure';

@Injectable()
export class ShopifyIntegrationService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: ShopifyCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Inject(SHOPIFY_PROVIDER) private readonly provider: ShopifyProvider,
  ) {}

  public register(command: RegisterCommand): Promise<ShopifyStoreResult> {
    const shopDomain = normalizeShopifyDomain(command.shopDomain);
    const storeId = randomUUID();
    return this.mutate({
      action: 'shopify.store.registered',
      command,
      lockKey: shopDomain,
      request: {
        currency: command.currency,
        displayName: command.displayName,
        name: command.name,
        organizationId: command.organizationId,
        shopDomain,
        timezone: command.timezone,
        tokenHash: hashSensitive(command.accessToken),
      },
      resourceId: storeId,
      scope: REGISTER_SCOPE,
      execute: async (transaction) => {
        const encrypted = this.cipher.encrypt(command.accessToken, command.organizationId, storeId);
        await transaction.store.create({
          data: {
            currency: command.currency,
            id: storeId,
            name: command.name,
            organizationId: command.organizationId,
            shopifyShopDomain: shopDomain,
            status: 'PENDING',
            timezone: command.timezone,
          },
        });
        await transaction.integrationConnection.create({
          data: {
            configJson: { mode: this.mode },
            displayName: command.displayName,
            encryptedCredentialsJson: { ...encrypted },
            organizationId: command.organizationId,
            provider: 'SHOPIFY',
            status: 'PENDING',
            storeId,
          },
        });
        await transaction.orderClassificationPolicy.create({
          data: {
            activatedAt: new Date(),
            active: true,
            organizationId: command.organizationId,
            rulesJson: DEFAULT_ORDER_CLASSIFICATION_POLICY,
            storeId,
            version: 1,
          },
        });
        return this.result(storeId, shopDomain, 'PENDING', 'UNKNOWN');
      },
    });
  }

  public testConnection(command: StoreCommand): Promise<ShopifyStoreResult> {
    return this.mutateStore({
      action: 'shopify.store.connection_tested',
      command,
      request: { operation: 'test' },
      scope: TEST_SCOPE,
      execute: async (transaction, connection) => {
        const accessToken = this.cipher.decrypt(
          connection.encryptedCredentialsJson,
          command.organizationId,
          command.storeId,
        );
        const probe = await this.provider.testConnection({
          accessToken,
          shopDomain: connection.store.shopifyShopDomain,
        });
        const status = probe.healthy ? 'TESTED' : 'ERROR';
        const health = probe.healthy ? 'HEALTHY' : 'UNHEALTHY';
        await transaction.integrationConnection.update({
          data: {
            configJson: {
              capabilities: probe.capabilities,
              mode: probe.mode,
              providerShopId: probe.providerShopId,
              sourceVersion: probe.sourceVersion,
            },
            lastHealthCheckAt: new Date(),
            lastHealthStatus: health,
            status,
          },
          where: { id: connection.id },
        });
        return this.result(command.storeId, connection.store.shopifyShopDomain, status, health);
      },
    });
  }

  public activate(command: StoreCommand): Promise<ShopifyStoreResult> {
    return this.mutateStore({
      action: 'shopify.store.activated',
      command,
      request: { operation: 'activate' },
      scope: ACTIVATE_SCOPE,
      execute: async (transaction, connection) => {
        if (connection.lastHealthStatus !== 'HEALTHY') {
          throw new ConflictException('A healthy connection test is required before activation');
        }
        let webhookSubscriptionId: string | undefined;
        if (this.mode === 'live') {
          if (connection.encryptedWebhookSecretJson === null) {
            throw new ConflictException('A webhook signing secret is required before activation');
          }
          const callbackBaseUrl = this.environment.shopifyWebhooks.callbackBaseUrl;
          if (callbackBaseUrl === undefined) {
            throw new ServiceUnavailableException('Shopify webhook callback URL is not configured');
          }
          const registration = await this.provider.ensureOrdersCreateWebhook({
            accessToken: this.cipher.decrypt(
              connection.encryptedCredentialsJson,
              command.organizationId,
              command.storeId,
            ),
            callbackUrl: `${callbackBaseUrl.replace(/\/$/u, '')}/webhooks/shopify/${command.storeId}/orders-create`,
            shopDomain: connection.store.shopifyShopDomain,
          });
          webhookSubscriptionId = registration.subscriptionId;
        }
        await transaction.integrationConnection.update({
          data: {
            ...(webhookSubscriptionId === undefined
              ? {}
              : {
                  configJson: {
                    ...this.configObject(connection.configJson),
                    mode: this.mode,
                    webhookSubscriptionId,
                  },
                }),
            status: 'ACTIVE',
          },
          where: { id: connection.id },
        });
        await transaction.store.update({
          data: { status: 'ACTIVE' },
          where: { id: command.storeId },
        });
        return this.result(
          command.storeId,
          connection.store.shopifyShopDomain,
          'ACTIVE',
          'HEALTHY',
        );
      },
    });
  }

  public deactivate(command: StoreCommand): Promise<ShopifyStoreResult> {
    return this.mutateStore({
      action: 'shopify.store.deactivated',
      command,
      request: { operation: 'deactivate' },
      scope: DEACTIVATE_SCOPE,
      execute: async (transaction, connection) => {
        await transaction.integrationConnection.update({
          data: { status: 'DISABLED' },
          where: { id: connection.id },
        });
        await transaction.store.update({
          data: { status: 'DISCONNECTED' },
          where: { id: command.storeId },
        });
        return this.result(
          command.storeId,
          connection.store.shopifyShopDomain,
          'DISABLED',
          connection.lastHealthStatus,
        );
      },
    });
  }

  public rotateCredentials(command: RotateCommand): Promise<ShopifyStoreResult> {
    return this.mutateStore({
      action: 'shopify.store.credentials_rotated',
      command,
      request: { operation: 'rotate', tokenHash: hashSensitive(command.accessToken) },
      scope: ROTATE_SCOPE,
      execute: async (transaction, connection) => {
        const encrypted = this.cipher.encrypt(
          command.accessToken,
          command.organizationId,
          command.storeId,
        );
        await transaction.integrationConnection.update({
          data: {
            credentialRotatedAt: new Date(),
            encryptedCredentialsJson: { ...encrypted },
            lastHealthCheckAt: null,
            lastHealthStatus: 'UNKNOWN',
            status: 'PENDING',
          },
          where: { id: connection.id },
        });
        await transaction.store.update({
          data: { status: 'PENDING' },
          where: { id: command.storeId },
        });
        return this.result(
          command.storeId,
          connection.store.shopifyShopDomain,
          'PENDING',
          'UNKNOWN',
        );
      },
    });
  }

  public configureWebhookSecret(
    command: ConfigureWebhookSecretCommand,
  ): Promise<ShopifyStoreResult> {
    return this.mutateStore({
      action: 'shopify.store.webhook_secret_configured',
      command,
      request: {
        operation: 'configure-webhook-secret',
        secretHash: hashSensitive(command.webhookSecret),
      },
      scope: WEBHOOK_SECRET_SCOPE,
      execute: async (transaction, connection) => {
        const encrypted = this.cipher.rotateWebhookSecret(
          command.webhookSecret,
          connection.encryptedWebhookSecretJson,
          command.organizationId,
          command.storeId,
          new Date(Date.now() + this.environment.shopifyWebhooks.secretOverlapHours * 3_600_000),
        );
        const encryptedJson: Prisma.InputJsonObject = {
          authTag: encrypted.authTag,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          version: encrypted.version,
          ...(encrypted.previous === undefined
            ? {}
            : {
                previous: {
                  authTag: encrypted.previous.authTag,
                  ciphertext: encrypted.previous.ciphertext,
                  iv: encrypted.previous.iv,
                  version: encrypted.previous.version,
                },
                previousValidUntil: encrypted.previousValidUntil ?? '',
              }),
        };
        await transaction.integrationConnection.update({
          data: { encryptedWebhookSecretJson: encryptedJson },
          where: { id: connection.id },
        });
        return this.result(
          command.storeId,
          connection.store.shopifyShopDomain,
          connection.status,
          connection.lastHealthStatus,
        );
      },
    });
  }

  private mutateStore(options: {
    readonly action: string;
    readonly command: ConfigureWebhookSecretCommand | RotateCommand | StoreCommand;
    readonly execute: (
      transaction: Prisma.TransactionClient,
      connection: Awaited<ReturnType<ShopifyIntegrationService['lockConnection']>>,
    ) => Promise<ShopifyStoreResult>;
    readonly request: Prisma.InputJsonObject;
    readonly scope: string;
  }): Promise<ShopifyStoreResult> {
    return this.mutate({
      ...options,
      lockKey: options.command.storeId,
      request: { ...options.request, storeId: options.command.storeId },
      resourceId: options.command.storeId,
      execute: async (transaction) => {
        const connection = await this.lockConnection(
          transaction,
          options.command.organizationId,
          options.command.storeId,
        );
        return options.execute(transaction, connection);
      },
    });
  }

  private async mutate(options: {
    readonly action: string;
    readonly command: BaseCommand;
    readonly execute: (transaction: Prisma.TransactionClient) => Promise<ShopifyStoreResult>;
    readonly lockKey: string;
    readonly request: Prisma.InputJsonObject;
    readonly resourceId: string;
    readonly scope: string;
  }): Promise<ShopifyStoreResult> {
    this.assertEnabled();
    const { command } = options;
    const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
    const hash = requestHash(options.request);
    try {
      const transactionResult = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              INSERT INTO idempotency_keys (scope, key, request_hash, expires_at)
              VALUES (${options.scope}, ${storedKey}, ${hash}, NOW() + INTERVAL '24 hours')
              ON CONFLICT (scope, key) DO NOTHING
            `;
            const [record] = await transaction.$queryRaw<LockedIdempotencyRow[]>`
              SELECT request_hash, response_snapshot_json, status
              FROM idempotency_keys
              WHERE scope = ${options.scope} AND key = ${storedKey}
              FOR UPDATE
            `;
            if (record === undefined) throw new Error('Idempotency record could not be locked');
            if (record.request_hash !== hash) {
              throw new ConflictException('Idempotency key was already used with another request');
            }
            if (record.status === 'completed' && record.response_snapshot_json !== null) {
              return {
                replayed: true,
                result: record.response_snapshot_json as unknown as ShopifyStoreResult,
              };
            }
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'shopify.integrations:' + command.organizationId + ':' + options.lockKey}, 0)
              )
            `;
            const result = await options.execute(transaction);
            await transaction.idempotencyKey.update({
              data: {
                responseSnapshotJson: { ...result },
                status: IdempotencyStatus.COMPLETED,
              },
              where: { scope_key: { key: storedKey, scope: options.scope } },
            });
            await transaction.auditLog.create({
              data: {
                action: options.action,
                actorUserId: command.principal.userId,
                correlationId: this.requestContext.correlationId ?? 'internal',
                metadataJson: { mode: this.mode },
                organizationId: command.organizationId,
                outcome: 'SUCCESS',
                resourceId: options.resourceId,
                resourceType: 'shopify_store',
              },
            });
            return { replayed: false, result };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordShopifyOperation(
        transactionResult.replayed ? `${options.action}.replayed` : options.action,
        'success',
      );
      return transactionResult.result;
    } catch (error) {
      await this.audit.record({
        action: `${options.action}_failed`,
        actorUserId: command.principal.userId,
        metadata: { mode: this.mode },
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: options.resourceId,
        resourceType: 'shopify_store',
      });
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2003')
      ) {
        throw new ConflictException('Shopify store conflicts with an existing record');
      }
      throw error;
    }
  }

  private assertEnabled(): void {
    const controls = this.environment.shopify;
    if (!controls.enabled || controls.killSwitch) {
      throw new ServiceUnavailableException('Shopify integration is disabled');
    }
  }

  private async lockConnection(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    storeId: string,
  ) {
    const connection = await transaction.integrationConnection.findFirst({
      include: { store: true },
      where: { organizationId, provider: 'SHOPIFY', storeId },
    });
    if (connection === null) throw new NotFoundException('Shopify store not found');
    return connection;
  }

  private result(
    storeId: string,
    shopDomain: string,
    status: 'ACTIVE' | 'DISABLED' | 'ERROR' | 'PENDING' | 'TESTED',
    health: 'HEALTHY' | 'UNKNOWN' | 'UNHEALTHY',
  ): ShopifyStoreResult {
    return {
      health: health.toLowerCase() as ShopifyStoreResult['health'],
      mode: this.mode,
      shopDomain,
      status: status.toLowerCase() as ShopifyStoreResult['status'],
      storeId,
    };
  }

  private get mode(): 'live' | 'simulation' {
    return this.environment.shopify.simulationMode ? 'simulation' : 'live';
  }

  private configObject(value: Prisma.JsonValue): Prisma.InputJsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
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
