import { randomUUID } from 'node:crypto';

import {
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
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './whatsapp-provider';

interface BaseCommand {
  readonly idempotencyKey: string;
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly storeId: string;
}

interface ConfigureCommand extends BaseCommand {
  readonly accessToken: string;
  readonly apiVersion: string;
  readonly businessAccountId: string;
  readonly displayName: string;
  readonly phoneNumberId: string;
}

interface RotateCommand extends BaseCommand {
  readonly accessToken: string;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

const configSchema = z.object({
  apiVersion: z.string(),
  businessAccountId: z.string(),
  fixtureVersion: z.string(),
  mode: z.literal('simulation'),
  phoneNumberId: z.string(),
  providerBusinessName: z.string().optional(),
  providerPhoneLabel: z.string().optional(),
});

export interface WhatsAppConnectionResult {
  readonly apiVersion: string;
  readonly businessAccountId: string;
  readonly connectionId: string;
  readonly displayName: string;
  readonly health: 'healthy' | 'unknown' | 'unhealthy';
  readonly mode: 'simulation';
  readonly phoneNumberId: string;
  readonly status: 'active' | 'disabled' | 'error' | 'pending' | 'tested';
  readonly storeId: string;
}

const CONFIGURE_SCOPE = 'whatsapp.connection.configure';
const TEST_SCOPE = 'whatsapp.connection.test';
const ACTIVATE_SCOPE = 'whatsapp.connection.activate';
const DEACTIVATE_SCOPE = 'whatsapp.connection.deactivate';
const ROTATE_SCOPE = 'whatsapp.connection.credentials.rotate';

@Injectable()
export class WhatsAppIntegrationService {
  public constructor(
    private readonly audit: AuditService,
    private readonly cipher: WhatsAppCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  public configure(command: ConfigureCommand): Promise<WhatsAppConnectionResult> {
    const connectionId = randomUUID();
    return this.mutate({
      action: 'whatsapp.connection.configured',
      command,
      eventType: 'whatsapp.connection.configured.v1',
      lockKey: `${command.storeId}:${command.phoneNumberId}`,
      request: {
        apiVersion: command.apiVersion,
        businessAccountId: command.businessAccountId,
        displayName: command.displayName,
        organizationId: command.organizationId,
        phoneNumberId: command.phoneNumberId,
        storeId: command.storeId,
        tokenHash: hashSensitive(command.accessToken),
      },
      resourceId: connectionId,
      scope: CONFIGURE_SCOPE,
      execute: async (transaction) => {
        const store = await transaction.store.findFirst({
          where: { id: command.storeId, organizationId: command.organizationId },
        });
        if (store === null) throw new NotFoundException('Store not found');
        const encrypted = this.cipher.encrypt(
          command.accessToken,
          command.organizationId,
          command.storeId,
        );
        await transaction.integrationConnection.create({
          data: {
            configJson: {
              apiVersion: command.apiVersion,
              businessAccountId: command.businessAccountId,
              fixtureVersion: 'v1',
              mode: 'simulation',
              phoneNumberId: command.phoneNumberId,
            },
            displayName: command.displayName,
            encryptedCredentialsJson: { ...encrypted },
            id: connectionId,
            organizationId: command.organizationId,
            provider: 'WHATSAPP',
            status: 'PENDING',
            storeId: command.storeId,
          },
        });
        return this.result(
          connectionId,
          command.storeId,
          command.displayName,
          {
            apiVersion: command.apiVersion,
            businessAccountId: command.businessAccountId,
            fixtureVersion: 'v1',
            mode: 'simulation',
            phoneNumberId: command.phoneNumberId,
          },
          'PENDING',
          'UNKNOWN',
        );
      },
    });
  }

  public testConnection(command: BaseCommand): Promise<WhatsAppConnectionResult> {
    return this.mutateConnection({
      action: 'whatsapp.connection.tested',
      command,
      eventType: 'whatsapp.connection.tested.v1',
      request: { operation: 'test' },
      scope: TEST_SCOPE,
      execute: async (transaction, connection, config) => {
        const accessToken = this.cipher.decrypt(
          connection.encryptedCredentialsJson,
          command.organizationId,
          command.storeId,
        );
        const probe = await this.provider.testConnection({ accessToken, ...config });
        const status = probe.healthy ? 'TESTED' : 'ERROR';
        const health = probe.healthy ? 'HEALTHY' : 'UNHEALTHY';
        const updatedConfig = {
          ...config,
          fixtureVersion: probe.fixtureVersion,
          mode: probe.mode,
          providerBusinessName: probe.providerBusinessName,
          providerPhoneLabel: probe.providerPhoneLabel,
        };
        await transaction.integrationConnection.update({
          data: {
            configJson: updatedConfig,
            lastHealthCheckAt: new Date(),
            lastHealthStatus: health,
            status,
          },
          where: { id: connection.id },
        });
        return this.result(
          connection.id,
          command.storeId,
          connection.displayName,
          updatedConfig,
          status,
          health,
        );
      },
    });
  }

  public activate(command: BaseCommand): Promise<WhatsAppConnectionResult> {
    return this.mutateConnection({
      action: 'whatsapp.connection.activated',
      command,
      eventType: 'whatsapp.connection.activated.v1',
      request: { operation: 'activate' },
      scope: ACTIVATE_SCOPE,
      execute: async (transaction, connection, config) => {
        if (connection.lastHealthStatus !== 'HEALTHY') {
          throw new ConflictException('A healthy connection test is required before activation');
        }
        await transaction.integrationConnection.update({
          data: { status: 'ACTIVE' },
          where: { id: connection.id },
        });
        return this.result(
          connection.id,
          command.storeId,
          connection.displayName,
          config,
          'ACTIVE',
          'HEALTHY',
        );
      },
    });
  }

  public deactivate(command: BaseCommand): Promise<WhatsAppConnectionResult> {
    return this.mutateConnection({
      action: 'whatsapp.connection.deactivated',
      command,
      eventType: 'whatsapp.connection.deactivated.v1',
      request: { operation: 'deactivate' },
      scope: DEACTIVATE_SCOPE,
      execute: async (transaction, connection, config) => {
        await transaction.integrationConnection.update({
          data: { status: 'DISABLED' },
          where: { id: connection.id },
        });
        return this.result(
          connection.id,
          command.storeId,
          connection.displayName,
          config,
          'DISABLED',
          connection.lastHealthStatus,
        );
      },
    });
  }

  public rotateCredentials(command: RotateCommand): Promise<WhatsAppConnectionResult> {
    return this.mutateConnection({
      action: 'whatsapp.connection.credentials_rotated',
      command,
      eventType: 'whatsapp.connection.credentials-rotated.v1',
      request: { operation: 'rotate', tokenHash: hashSensitive(command.accessToken) },
      scope: ROTATE_SCOPE,
      execute: async (transaction, connection, config) => {
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
        return this.result(
          connection.id,
          command.storeId,
          connection.displayName,
          config,
          'PENDING',
          'UNKNOWN',
        );
      },
    });
  }

  private mutateConnection(options: {
    readonly action: string;
    readonly command: BaseCommand | RotateCommand;
    readonly eventType: string;
    readonly execute: (
      transaction: Prisma.TransactionClient,
      connection: Awaited<ReturnType<WhatsAppIntegrationService['lockConnection']>>,
      config: z.infer<typeof configSchema>,
    ) => Promise<WhatsAppConnectionResult>;
    readonly request: Prisma.InputJsonObject;
    readonly scope: string;
  }): Promise<WhatsAppConnectionResult> {
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
        return options.execute(transaction, connection, this.parseConfig(connection.configJson));
      },
    });
  }

  private async mutate(options: {
    readonly action: string;
    readonly command: BaseCommand;
    readonly eventType: string;
    readonly execute: (transaction: Prisma.TransactionClient) => Promise<WhatsAppConnectionResult>;
    readonly lockKey: string;
    readonly request: Prisma.InputJsonObject;
    readonly resourceId: string;
    readonly scope: string;
  }): Promise<WhatsAppConnectionResult> {
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
                result: record.response_snapshot_json as unknown as WhatsAppConnectionResult,
              };
            }
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'whatsapp.integrations:' + command.organizationId + ':' + options.lockKey}, 0)
              )
            `;
            const result = await options.execute(transaction);
            const correlationId = this.requestContext.correlationId ?? 'internal';
            await transaction.outboxEvent.create({
              data: {
                aggregateId: result.connectionId,
                aggregateType: 'whatsapp_connection',
                correlationId,
                eventType: options.eventType,
                organizationId: command.organizationId,
                payloadJson: {
                  connectionId: result.connectionId,
                  health: result.health,
                  mode: result.mode,
                  status: result.status,
                  storeId: result.storeId,
                },
              },
            });
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
                correlationId,
                metadataJson: { mode: 'simulation' },
                organizationId: command.organizationId,
                outcome: 'SUCCESS',
                resourceId: result.connectionId,
                resourceType: 'whatsapp_connection',
              },
            });
            return { replayed: false, result };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordWhatsAppOperation(
        transactionResult.replayed ? `${options.action}.replayed` : options.action,
        'success',
      );
      return transactionResult.result;
    } catch (error) {
      await this.audit.record({
        action: `${options.action}_failed`,
        actorUserId: command.principal.userId,
        metadata: { mode: 'simulation' },
        organizationId: command.organizationId,
        outcome: 'FAILURE',
        resourceId: options.resourceId,
        resourceType: 'whatsapp_connection',
      });
      this.metrics.recordWhatsAppOperation(options.action, 'failure');
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2003')
      ) {
        throw new ConflictException('WhatsApp connection conflicts with an existing record');
      }
      throw error;
    }
  }

  private assertEnabled(): void {
    const controls = this.environment.whatsapp;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new ServiceUnavailableException('WhatsApp integration simulation is disabled');
    }
  }

  private async lockConnection(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    storeId: string,
  ) {
    const connection = await transaction.integrationConnection.findFirst({
      where: { organizationId, provider: 'WHATSAPP', storeId },
    });
    if (connection === null) throw new NotFoundException('WhatsApp connection not found');
    return connection;
  }

  private parseConfig(value: Prisma.JsonValue): z.infer<typeof configSchema> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      throw new ServiceUnavailableException('WhatsApp connection configuration is invalid');
    }
    return parsed.data;
  }

  private result(
    connectionId: string,
    storeId: string,
    displayName: string,
    config: z.infer<typeof configSchema>,
    status: 'ACTIVE' | 'DISABLED' | 'ERROR' | 'PENDING' | 'TESTED',
    health: 'HEALTHY' | 'UNKNOWN' | 'UNHEALTHY',
  ): WhatsAppConnectionResult {
    return {
      apiVersion: config.apiVersion,
      businessAccountId: config.businessAccountId,
      connectionId,
      displayName,
      health: health.toLowerCase() as WhatsAppConnectionResult['health'],
      mode: 'simulation',
      phoneNumberId: config.phoneNumberId,
      status: status.toLowerCase() as WhatsAppConnectionResult['status'],
      storeId,
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
