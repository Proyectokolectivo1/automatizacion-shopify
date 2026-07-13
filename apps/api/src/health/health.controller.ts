import { Controller, Get } from '@nestjs/common';

import { type HealthStatus } from './health-status';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get()
  public getHealth(): HealthStatus {
    return this.healthService.getStatus();
  }
}
