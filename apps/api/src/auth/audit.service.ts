import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { AuditOutcome, Prisma } from '../generated/prisma/client';
import { RequestContextService } from '../observability/request-context.service';
import { MetricsService } from '../observability/metrics.service';

export interface AuditEvent {
  readonly action: string;
  readonly actorUserId?: string | undefined;
  readonly metadata?: Prisma.InputJsonObject;
  readonly organizationId?: string | undefined;
  readonly outcome: AuditOutcome;
  readonly resourceId?: string | undefined;
  readonly resourceType?: string | undefined;
}

@Injectable()
export class AuditService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly metrics: MetricsService,
  ) {}

  public async record(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: event.action,
        actorUserId: event.actorUserId ?? null,
        correlationId: this.requestContext.correlationId ?? 'internal',
        metadataJson: event.metadata ?? {},
        organizationId: event.organizationId ?? null,
        outcome: event.outcome,
        resourceId: event.resourceId ?? null,
        resourceType: event.resourceType ?? null,
      },
    });
    if (event.action.startsWith('auth.') || event.action.startsWith('authorization.')) {
      this.metrics.recordAuth(event.action, event.outcome.toLowerCase());
    }
  }
}
