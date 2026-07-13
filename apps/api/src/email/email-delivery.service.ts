import { randomUUID } from 'node:crypto';

import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';

export interface EmailDeliveryResult {
  readonly deliveryId?: string;
  readonly status: 'blocked' | 'simulated';
}

export interface SimulatedEmailFixture {
  readonly deliveryId: string;
  readonly kind: 'invitation' | 'password_reset';
  readonly recipient: string;
  readonly token: string;
}

@Injectable()
export class EmailDeliveryService {
  private readonly simulationFixtures: SimulatedEmailFixture[] = [];

  public constructor(
    @Inject(EnvironmentService)
    private readonly environment: Pick<EnvironmentService, 'emailDelivery'>,
  ) {}

  public sendInvitation(recipient: string, invitationToken: string): EmailDeliveryResult {
    return this.deliver('invitation', recipient, invitationToken);
  }

  public sendPasswordReset(recipient: string, resetToken: string): EmailDeliveryResult {
    return this.deliver('password_reset', recipient, resetToken);
  }

  public takeSimulationFixture(
    kind: SimulatedEmailFixture['kind'],
    recipient: string,
  ): SimulatedEmailFixture | undefined {
    const index = this.simulationFixtures.findIndex(
      (fixture) => fixture.kind === kind && fixture.recipient === recipient,
    );
    if (index < 0) return undefined;
    return this.simulationFixtures.splice(index, 1)[0];
  }

  private deliver(
    kind: SimulatedEmailFixture['kind'],
    recipient: string,
    token: string,
  ): EmailDeliveryResult {
    const config = this.environment.emailDelivery;
    if (!config.enabled || config.killSwitch) return { status: 'blocked' };
    if (!config.simulationMode) {
      throw new ServiceUnavailableException('No email provider is configured');
    }
    const deliveryId = `simulated-${randomUUID()}`;
    this.simulationFixtures.push({ deliveryId, kind, recipient, token });
    return { deliveryId, status: 'simulated' };
  }
}
