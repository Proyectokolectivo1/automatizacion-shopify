import { Controller, Get, Header, Headers, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { EnvironmentService } from '../config/environment.service';
import { canAccessMetrics } from './metrics-access';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  public constructor(
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  public async getMetrics(
    @Headers('authorization') authorization: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const access = this.environment.metricsAccess;
    if (
      !canAccessMetrics({
        authorization,
        bearerToken: access.bearerToken,
        mode: access.mode,
        remoteAddress: request.socket.remoteAddress,
      })
    ) {
      throw new UnauthorizedException('Metrics access denied');
    }
    response.setHeader('content-type', this.metrics.contentType);
    return this.metrics.render();
  }
}
