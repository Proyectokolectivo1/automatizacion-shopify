import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';

import { DependencyHealthService, type ReadinessStatus } from './dependency-health.service';
import { type HealthStatus } from './health-status';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  public constructor(
    private readonly healthService: HealthService,
    private readonly dependencyHealth: DependencyHealthService,
  ) {}

  @Get()
  public getHealth(): HealthStatus {
    return this.healthService.getStatus();
  }

  @Get('live')
  public getLiveness(): HealthStatus {
    return this.healthService.getStatus();
  }

  @Get('ready')
  public async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessStatus> {
    const readiness = await this.dependencyHealth.getReadiness();
    response.status(readiness.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return readiness;
  }
}
