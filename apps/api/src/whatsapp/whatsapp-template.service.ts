import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { hashSensitive } from '../auth/token';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { IdempotencyStatus, Prisma } from '../generated/prisma/client';
import { requestHash } from '../foundation/request-hash';
import { MetricsService } from '../observability/metrics.service';
import { RequestContextService } from '../observability/request-context.service';
import type { WhatsAppTemplateContent } from './whatsapp-template.contract';

interface TenantCommand {
  readonly organizationId: string;
  readonly principal: AuthPrincipal;
  readonly storeId: string;
}

interface MutationCommand extends TenantCommand {
  readonly idempotencyKey: string;
}

interface CreateCommand extends MutationCommand, WhatsAppTemplateContent {
  readonly eventType: string;
  readonly languageCode: string;
  readonly name: string;
}

interface CreateVersionCommand extends MutationCommand, WhatsAppTemplateContent {
  readonly templateKey: string;
}

interface ReviewCommand extends MutationCommand {
  readonly decision: 'APPROVE' | 'REJECT';
  readonly reasonCode?: string | undefined;
  readonly templateId: string;
}

interface LifecycleCommand extends MutationCommand {
  readonly templateId: string;
}

interface LockedIdempotencyRow {
  request_hash: string;
  response_snapshot_json: Prisma.JsonValue | null;
  status: 'completed' | 'failed' | 'processing';
}

export interface WhatsAppTemplateResult {
  readonly active: boolean;
  readonly bodyTemplate: string;
  readonly category: 'authentication' | 'marketing' | 'utility';
  readonly eventType: string;
  readonly languageCode: string;
  readonly metaTemplateName: string;
  readonly mode: 'simulation';
  readonly name: string;
  readonly status: 'local_draft' | 'simulated_approved' | 'simulated_rejected';
  readonly statusReasonCode: string | null;
  readonly storeId: string;
  readonly templateId: string;
  readonly templateKey: string;
  readonly variablesSchema: Prisma.JsonValue;
  readonly version: number;
}

export interface WhatsAppTemplateListResult {
  readonly items: readonly WhatsAppTemplateResult[];
  readonly mode: 'simulation';
  readonly nextCursor: string | null;
}

const CREATE_SCOPE = 'whatsapp.template.create';
const VERSION_SCOPE = 'whatsapp.template.version.create';
const REVIEW_SCOPE = 'whatsapp.template.review';
const ACTIVATE_SCOPE = 'whatsapp.template.activate';
const DEACTIVATE_SCOPE = 'whatsapp.template.deactivate';

@Injectable()
export class WhatsAppTemplateService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  public create(command: CreateCommand): Promise<WhatsAppTemplateResult> {
    const templateId = randomUUID();
    const templateKey = randomUUID();
    return this.mutate({
      action: 'whatsapp.template.created',
      command,
      eventType: 'whatsapp.template.created.v1',
      lockKey: `${command.storeId}:${command.eventType}:${command.languageCode}`,
      request: this.contentRequest(command, {
        eventType: command.eventType,
        languageCode: command.languageCode,
        name: command.name,
      }),
      resourceId: templateId,
      scope: CREATE_SCOPE,
      execute: async (transaction) => {
        await this.assertConnection(transaction, command.organizationId, command.storeId);
        const template = await transaction.whatsAppTemplate.create({
          data: {
            bodyTemplate: command.bodyTemplate,
            category: command.category,
            eventType: command.eventType,
            id: templateId,
            languageCode: command.languageCode,
            metaTemplateName: command.metaTemplateName,
            name: command.name,
            organizationId: command.organizationId,
            storeId: command.storeId,
            templateKey,
            variablesSchemaJson: command.variablesSchema,
            version: 1,
          },
        });
        return this.result(template);
      },
    });
  }

  public createVersion(command: CreateVersionCommand): Promise<WhatsAppTemplateResult> {
    const templateId = randomUUID();
    return this.mutate({
      action: 'whatsapp.template.version_created',
      command,
      eventType: 'whatsapp.template.version-created.v1',
      lockKey: `${command.storeId}:${command.templateKey}`,
      request: this.contentRequest(command, { templateKey: command.templateKey }),
      resourceId: templateId,
      scope: VERSION_SCOPE,
      execute: async (transaction) => {
        await this.assertConnection(transaction, command.organizationId, command.storeId);
        const latest = await transaction.whatsAppTemplate.findFirst({
          orderBy: { version: 'desc' },
          where: {
            organizationId: command.organizationId,
            storeId: command.storeId,
            templateKey: command.templateKey,
          },
        });
        if (latest === null) throw new NotFoundException('WhatsApp template not found');
        const template = await transaction.whatsAppTemplate.create({
          data: {
            bodyTemplate: command.bodyTemplate,
            category: command.category,
            eventType: latest.eventType,
            id: templateId,
            languageCode: latest.languageCode,
            metaTemplateName: command.metaTemplateName,
            name: latest.name,
            organizationId: command.organizationId,
            storeId: command.storeId,
            templateKey: latest.templateKey,
            variablesSchemaJson: command.variablesSchema,
            version: latest.version + 1,
          },
        });
        return this.result(template);
      },
    });
  }

  public review(command: ReviewCommand): Promise<WhatsAppTemplateResult> {
    return this.mutateLifecycle({
      action: 'whatsapp.template.reviewed',
      command,
      eventType: 'whatsapp.template.reviewed.v1',
      request: { decision: command.decision, reasonCode: command.reasonCode ?? null },
      scope: REVIEW_SCOPE,
      execute: async (transaction, template) => {
        if (template.status !== 'LOCAL_DRAFT' || template.active) {
          throw new ConflictException('Only an inactive local draft can be reviewed');
        }
        const updated = await transaction.whatsAppTemplate.update({
          data: {
            reviewedAt: new Date(),
            status: command.decision === 'APPROVE' ? 'SIMULATED_APPROVED' : 'SIMULATED_REJECTED',
            statusReasonCode: command.decision === 'REJECT' ? (command.reasonCode ?? null) : null,
          },
          where: { id: template.id },
        });
        return this.result(updated);
      },
    });
  }

  public activate(command: LifecycleCommand): Promise<WhatsAppTemplateResult> {
    return this.mutateLifecycle({
      action: 'whatsapp.template.activated',
      command,
      eventType: 'whatsapp.template.activated.v1',
      request: { operation: 'activate' },
      scope: ACTIVATE_SCOPE,
      execute: async (transaction, template) => {
        if (template.status !== 'SIMULATED_APPROVED') {
          throw new ConflictException('A simulated approval is required before activation');
        }
        await transaction.whatsAppTemplate.updateMany({
          data: { active: false },
          where: {
            active: true,
            eventType: template.eventType,
            languageCode: template.languageCode,
            storeId: command.storeId,
          },
        });
        return this.result(
          await transaction.whatsAppTemplate.update({
            data: { active: true },
            where: { id: template.id },
          }),
        );
      },
    });
  }

  public deactivate(command: LifecycleCommand): Promise<WhatsAppTemplateResult> {
    return this.mutateLifecycle({
      action: 'whatsapp.template.deactivated',
      command,
      eventType: 'whatsapp.template.deactivated.v1',
      request: { operation: 'deactivate' },
      scope: DEACTIVATE_SCOPE,
      execute: async (transaction, template) => {
        if (!template.active) throw new ConflictException('WhatsApp template is not active');
        return this.result(
          await transaction.whatsAppTemplate.update({
            data: { active: false },
            where: { id: template.id },
          }),
        );
      },
    });
  }

  public async list(
    command: TenantCommand & { readonly cursor?: string | undefined; readonly limit: number },
  ): Promise<WhatsAppTemplateListResult> {
    this.assertEnabled();
    try {
      await this.assertConnection(this.prisma, command.organizationId, command.storeId);
      if (command.cursor !== undefined) {
        const cursorExists = await this.prisma.whatsAppTemplate.count({
          where: {
            id: command.cursor,
            organizationId: command.organizationId,
            storeId: command.storeId,
          },
        });
        if (cursorExists === 0) throw new NotFoundException('WhatsApp template cursor not found');
      }
      const templates = await this.prisma.whatsAppTemplate.findMany({
        ...(command.cursor === undefined ? {} : { cursor: { id: command.cursor } }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: command.cursor === undefined ? 0 : 1,
        take: command.limit + 1,
        where: { organizationId: command.organizationId, storeId: command.storeId },
      });
      const hasNext = templates.length > command.limit;
      const items = templates.slice(0, command.limit);
      this.metrics.recordWhatsAppTemplateOperation('whatsapp.template.listed', 'success');
      return {
        items: items.map((template) => this.result(template)),
        mode: 'simulation',
        nextCursor: hasNext ? (items.at(-1)?.id ?? null) : null,
      };
    } catch (error) {
      this.metrics.recordWhatsAppTemplateOperation('whatsapp.template.listed', 'failure');
      throw error;
    }
  }

  private mutateLifecycle(options: {
    readonly action: string;
    readonly command: LifecycleCommand | ReviewCommand;
    readonly eventType: string;
    readonly execute: (
      transaction: Prisma.TransactionClient,
      template: Awaited<ReturnType<WhatsAppTemplateService['lockTemplate']>>,
    ) => Promise<WhatsAppTemplateResult>;
    readonly request: Prisma.InputJsonObject;
    readonly scope: string;
  }): Promise<WhatsAppTemplateResult> {
    return this.mutate({
      ...options,
      lockKey: `${options.command.storeId}:${options.command.templateId}`,
      request: { ...options.request, templateId: options.command.templateId },
      resourceId: options.command.templateId,
      execute: async (transaction) => {
        await this.assertConnection(
          transaction,
          options.command.organizationId,
          options.command.storeId,
        );
        const template = await this.lockTemplate(
          transaction,
          options.command.organizationId,
          options.command.storeId,
          options.command.templateId,
        );
        return options.execute(transaction, template);
      },
    });
  }

  private async mutate(options: {
    readonly action: string;
    readonly command: MutationCommand;
    readonly eventType: string;
    readonly execute: (transaction: Prisma.TransactionClient) => Promise<WhatsAppTemplateResult>;
    readonly lockKey: string;
    readonly request: Prisma.InputJsonObject;
    readonly resourceId: string;
    readonly scope: string;
  }): Promise<WhatsAppTemplateResult> {
    this.assertEnabled();
    const { command } = options;
    const storedKey = `${command.organizationId}:${hashSensitive(command.idempotencyKey)}`;
    const hash = requestHash({
      ...options.request,
      organizationId: command.organizationId,
      storeId: command.storeId,
    });
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
                result: record.response_snapshot_json as unknown as WhatsAppTemplateResult,
              };
            }
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'whatsapp.templates:' + command.organizationId + ':' + options.lockKey}, 0)
              )
            `;
            const result = await options.execute(transaction);
            const correlationId = this.requestContext.correlationId ?? 'internal';
            await transaction.outboxEvent.create({
              data: {
                aggregateId: result.templateId,
                aggregateType: 'whatsapp_template',
                correlationId,
                eventType: options.eventType,
                organizationId: command.organizationId,
                payloadJson: {
                  active: result.active,
                  mode: result.mode,
                  status: result.status,
                  storeId: result.storeId,
                  templateId: result.templateId,
                  templateKey: result.templateKey,
                  version: result.version,
                },
              },
            });
            await transaction.idempotencyKey.update({
              data: { responseSnapshotJson: { ...result }, status: IdempotencyStatus.COMPLETED },
              where: { scope_key: { key: storedKey, scope: options.scope } },
            });
            await transaction.auditLog.create({
              data: {
                action: options.action,
                actorUserId: command.principal.userId,
                correlationId,
                metadataJson: { mode: 'simulation', version: result.version },
                organizationId: command.organizationId,
                outcome: 'SUCCESS',
                resourceId: result.templateId,
                resourceType: 'whatsapp_template',
              },
            });
            return { replayed: false, result };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordWhatsAppTemplateOperation(
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
        resourceType: 'whatsapp_template',
      });
      this.metrics.recordWhatsAppTemplateOperation(options.action, 'failure');
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2003')
      ) {
        throw new ConflictException('WhatsApp template conflicts with an existing record');
      }
      throw error;
    }
  }

  private contentRequest(
    content: WhatsAppTemplateContent,
    identity: Prisma.InputJsonObject,
  ): Prisma.InputJsonObject {
    return {
      ...identity,
      bodyTemplate: content.bodyTemplate,
      category: content.category,
      metaTemplateName: content.metaTemplateName,
      variablesSchema: content.variablesSchema,
    };
  }

  private assertEnabled(): void {
    const controls = this.environment.whatsappTemplates;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new ServiceUnavailableException('WhatsApp template simulation is disabled');
    }
  }

  private async assertConnection(
    transaction: Pick<Prisma.TransactionClient, 'integrationConnection'>,
    organizationId: string,
    storeId: string,
  ): Promise<void> {
    const connection = await transaction.integrationConnection.count({
      where: { organizationId, provider: 'WHATSAPP', storeId },
    });
    if (connection === 0) throw new NotFoundException('WhatsApp connection not found');
  }

  private async lockTemplate(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    storeId: string,
    templateId: string,
  ) {
    const template = await transaction.whatsAppTemplate.findFirst({
      where: { id: templateId, organizationId, storeId },
    });
    if (template === null) throw new NotFoundException('WhatsApp template not found');
    return template;
  }

  private result(
    template: Awaited<ReturnType<WhatsAppTemplateService['lockTemplate']>>,
  ): WhatsAppTemplateResult {
    return {
      active: template.active,
      bodyTemplate: template.bodyTemplate,
      category: template.category.toLowerCase() as WhatsAppTemplateResult['category'],
      eventType: template.eventType,
      languageCode: template.languageCode,
      metaTemplateName: template.metaTemplateName,
      mode: 'simulation',
      name: template.name,
      status: template.status.toLowerCase() as WhatsAppTemplateResult['status'],
      statusReasonCode: template.statusReasonCode,
      storeId: template.storeId,
      templateId: template.id,
      templateKey: template.templateKey,
      variablesSchema: template.variablesSchemaJson,
      version: template.version,
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
