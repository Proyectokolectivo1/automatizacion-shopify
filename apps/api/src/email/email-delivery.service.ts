import { randomUUID } from 'node:crypto';

import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';

export interface EmailDeliveryResult {
  readonly deliveryId?: string;
  readonly status: 'blocked' | 'simulated';
}

@Injectable()
export class EmailDeliveryService {
  public constructor(
    @Inject(EnvironmentService)
    private readonly environment: Pick<EnvironmentService, 'emailDelivery'>,
  ) {}

  public sendInvitation(recipient: string, invitationToken: string): EmailDeliveryResult {
    void recipient;
    void invitationToken;
    const config = this.environment.emailDelivery;
    if (!config.enabled || config.killSwitch) return { status: 'blocked' };
    if (!config.simulationMode) {
      throw new ServiceUnavailableException('No email provider is configured');
    }
    return { deliveryId: `simulated-${randomUUID()}`, status: 'simulated' };
  }
}
