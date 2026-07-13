import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  public constructor(private readonly metrics: MetricsService) {}

  @Get()
  public async getMetrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.setHeader('content-type', this.metrics.contentType);
    return this.metrics.render();
  }
}
