import { Injectable } from '@nestjs/common';

import { type HealthStatus } from './health-status';

@Injectable()
export class HealthService {
  public getStatus(): HealthStatus {
    return {
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
