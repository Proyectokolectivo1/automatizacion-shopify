import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AuditService } from '../auth/audit.service';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { operationalItemsForOrganizationsSql } from './operational-read-model';
import { OPERATIONAL_ALERT_RULES_V1 } from './operational-alert-rules';

interface EvaluationResultRow {
  readonly createdCount: number;
  readonly refreshedCount: number;
  readonly resolvedCount: number;
}

export interface OperationalAlertEvaluationResult {
  readonly created: number;
  readonly refreshed: number;
  readonly resolved: number;
}

@Injectable()
export class OperationalAlertEvaluatorService {
  public constructor(
    private readonly audit: AuditService,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async evaluateOrganizations(
    organizationIds: readonly string[],
    window: { readonly from: Date; readonly to: Date },
  ): Promise<OperationalAlertEvaluationResult> {
    this.assertEnabled();
    const targetOrganizationIds = [...new Set(organizationIds)].sort();
    if (targetOrganizationIds.length === 0) return { created: 0, refreshed: 0, resolved: 0 };
    if (targetOrganizationIds.length > this.environment.operationalAlerts.batchSize) {
      throw new Error('Operational alert batch exceeds the configured limit');
    }
    if (window.from >= window.to) throw new Error('Operational alert window is invalid');
    const maxWindowMs = this.environment.operationalAlerts.lookbackHours * 60 * 60 * 1000;
    if (window.to.getTime() - window.from.getTime() > maxWindowMs) {
      throw new Error('Operational alert window exceeds the configured lookback');
    }

    const tenants = targetOrganizationIds.map(
      (organizationId) => Prisma.sql`(${organizationId}::uuid)`,
    );
    const rules = OPERATIONAL_ALERT_RULES_V1.map(
      (rule) => Prisma.sql`(${rule.key}::text, ${rule.version}::integer, ${rule.type}::text)`,
    );

    try {
      const rows = await this.prisma.$transaction(
        async (transaction) => {
          await transaction.$queryRaw(Prisma.sql`
            WITH ordered_tenants AS MATERIALIZED (
              SELECT organization_id
              FROM (VALUES ${Prisma.join(tenants)}) AS tenant(organization_id)
              ORDER BY organization_id
            )
            SELECT pg_advisory_xact_lock(
              hashtextextended(organization_id::text || ':operational-alerts-v1', 0)
            )::text AS lock_result
            FROM ordered_tenants
          `);
          return transaction.$queryRaw<EvaluationResultRow[]>(Prisma.sql`
        WITH tenants(organization_id) AS (VALUES ${Prisma.join(tenants)}),
        rules(rule_key, rule_version, item_type) AS (VALUES ${Prisma.join(rules)}),
        operational_items AS (${operationalItemsForOrganizationsSql(targetOrganizationIds)}),
        counts AS MATERIALIZED (
          SELECT
            tenant.organization_id,
            rule.rule_key,
            rule.rule_version,
            rule.item_type,
            COUNT(item.item_id)::integer AS observed_count
          FROM tenants tenant
          CROSS JOIN rules rule
          LEFT JOIN operational_items item
            ON item.organization_id = tenant.organization_id
            AND item.item_type = rule.item_type
            AND item.requires_attention
            AND item.occurred_at >= ${window.from}
            AND item.occurred_at < ${window.to}
          GROUP BY tenant.organization_id, rule.rule_key, rule.rule_version, rule.item_type
        ),
        resolved AS (
          UPDATE operational_alerts alert
          SET
            status = 'resolved',
            observed_count = 0,
            window_started_at = ${window.from},
            window_ended_at = ${window.to},
            last_evaluated_at = ${window.to},
            resolved_at = ${window.to},
            updated_at = CURRENT_TIMESTAMP
          FROM counts
          WHERE alert.organization_id = counts.organization_id
            AND alert.rule_key = counts.rule_key
            AND alert.rule_version = counts.rule_version
            AND alert.status = 'open'
            AND counts.observed_count = 0
          RETURNING alert.id
        ),
        refreshed AS (
          UPDATE operational_alerts alert
          SET
            observed_count = counts.observed_count,
            window_started_at = ${window.from},
            window_ended_at = ${window.to},
            last_detected_at = ${window.to},
            last_evaluated_at = ${window.to},
            updated_at = CURRENT_TIMESTAMP
          FROM counts
          WHERE alert.organization_id = counts.organization_id
            AND alert.rule_key = counts.rule_key
            AND alert.rule_version = counts.rule_version
            AND alert.status = 'open'
            AND counts.observed_count > 0
          RETURNING alert.id
        ),
        created AS (
          INSERT INTO operational_alerts (
            organization_id,
            rule_key,
            rule_version,
            item_type,
            status,
            observed_count,
            window_started_at,
            window_ended_at,
            first_detected_at,
            last_detected_at,
            last_evaluated_at
          )
          SELECT
            counts.organization_id,
            counts.rule_key,
            counts.rule_version,
            counts.item_type,
            'open',
            counts.observed_count,
            ${window.from},
            ${window.to},
            ${window.to},
            ${window.to},
            ${window.to}
          FROM counts
          WHERE counts.observed_count > 0
            AND NOT EXISTS (
              SELECT 1
              FROM operational_alerts alert
              WHERE alert.organization_id = counts.organization_id
                AND alert.rule_key = counts.rule_key
                AND alert.rule_version = counts.rule_version
                AND alert.status = 'open'
            )
          RETURNING id
        )
        SELECT
          (SELECT COUNT(*)::integer FROM created) AS "createdCount",
          (SELECT COUNT(*)::integer FROM refreshed) AS "refreshedCount",
          (SELECT COUNT(*)::integer FROM resolved) AS "resolvedCount"
      `);
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      const row = rows[0] ?? { createdCount: 0, refreshedCount: 0, resolvedCount: 0 };
      const result = {
        created: row.createdCount,
        refreshed: row.refreshedCount,
        resolved: row.resolvedCount,
      };
      this.metrics.recordOperationalAlerts('evaluate', 'success');
      await Promise.all(
        targetOrganizationIds.map((organizationId) =>
          this.audit.record({
            action: 'operations.alerts.evaluated',
            metadata: {
              batchSize: targetOrganizationIds.length,
              ruleVersion: 1,
              windowMinutes: Math.round((window.to.getTime() - window.from.getTime()) / 60_000),
            },
            organizationId,
            outcome: 'SUCCESS',
            resourceType: 'operational_alert',
          }),
        ),
      );
      return result;
    } catch (error) {
      this.metrics.recordOperationalAlerts('evaluate', 'failure');
      throw error;
    }
  }

  private assertEnabled(): void {
    const alerts = this.environment.operationalAlerts;
    if (!alerts.enabled || alerts.killSwitch) {
      throw new ServiceUnavailableException('Operational alerts are disabled');
    }
  }
}
