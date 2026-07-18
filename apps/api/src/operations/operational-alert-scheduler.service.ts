import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import {
  OperationalAlertEvaluatorService,
  type OperationalAlertEvaluationResult,
} from './operational-alert-evaluator.service';

@Injectable()
export class OperationalAlertSchedulerService implements OnModuleInit, OnModuleDestroy {
  private cursor: string | undefined;
  private interval: NodeJS.Timeout | undefined;
  private running = false;

  public constructor(
    private readonly environment: EnvironmentService,
    private readonly evaluator: OperationalAlertEvaluatorService,
    private readonly prisma: PrismaService,
  ) {}

  public onModuleInit(): void {
    const alerts = this.environment.operationalAlerts;
    if (!alerts.enabled || alerts.killSwitch) return;
    this.interval = setInterval(() => void this.runOnce(), alerts.pollIntervalMs);
    this.interval.unref();
  }

  public onModuleDestroy(): void {
    if (this.interval !== undefined) clearInterval(this.interval);
  }

  public async runOnce(now = new Date()): Promise<OperationalAlertEvaluationResult> {
    const alerts = this.environment.operationalAlerts;
    if (!alerts.enabled || alerts.killSwitch || this.running) {
      return { created: 0, refreshed: 0, resolved: 0 };
    }
    this.running = true;
    try {
      const organizations = await this.prisma.organization.findMany({
        orderBy: { id: 'asc' },
        select: { id: true },
        take: alerts.batchSize,
        ...(this.cursor === undefined ? {} : { where: { id: { gt: this.cursor } } }),
      });
      if (organizations.length === 0) {
        this.cursor = undefined;
        return { created: 0, refreshed: 0, resolved: 0 };
      }
      this.cursor = organizations.at(-1)?.id;
      const to = now;
      const from = new Date(to.getTime() - alerts.lookbackHours * 60 * 60 * 1000);
      return this.evaluator.evaluateOrganizations(
        organizations.map(({ id }) => id),
        { from, to },
      );
    } finally {
      this.running = false;
    }
  }
}
