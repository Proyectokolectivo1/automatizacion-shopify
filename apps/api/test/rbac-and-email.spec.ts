import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { roleHasPermission } from '../src/auth/permissions';
import { EmailDeliveryService } from '../src/email/email-delivery.service';

describe('RBAC policy', () => {
  it('allows organization management only to owner and admin', () => {
    expect(roleHasPermission('OWNER', 'organization.manage')).toBe(true);
    expect(roleHasPermission('ADMIN', 'organization.manage')).toBe(true);
    expect(roleHasPermission('READ_ONLY', 'organization.manage')).toBe(false);
  });

  it('keeps read permissions for operational roles', () => {
    expect(roleHasPermission('OPERATIONS', 'organization.read')).toBe(true);
    expect(roleHasPermission('FINANCE', 'organization.read')).toBe(true);
  });
});

describe('email delivery safety controls', () => {
  it('is blocked when disabled or killed', () => {
    const service = new EmailDeliveryService({
      emailDelivery: { enabled: false, killSwitch: true, simulationMode: true },
    });
    expect(service.sendInvitation('user@example.test', 'secret')).toEqual({ status: 'blocked' });
  });

  it('returns a simulation receipt without sending externally', () => {
    const service = new EmailDeliveryService({
      emailDelivery: { enabled: true, killSwitch: false, simulationMode: true },
    });
    expect(service.sendInvitation('user@example.test', 'secret')).toMatchObject({
      status: 'simulated',
    });
    expect(service.takeSimulationFixture('invitation', 'user@example.test')).toMatchObject({
      kind: 'invitation',
      recipient: 'user@example.test',
      token: 'secret',
    });
    expect(service.takeSimulationFixture('invitation', 'user@example.test')).toBeUndefined();

    expect(service.sendPasswordReset('user@example.test', 'reset-secret')).toMatchObject({
      status: 'simulated',
    });
    expect(service.takeSimulationFixture('password_reset', 'user@example.test')).toMatchObject({
      token: 'reset-secret',
    });
  });

  it('fails closed when real mode has no configured provider', () => {
    const service = new EmailDeliveryService({
      emailDelivery: { enabled: true, killSwitch: false, simulationMode: false },
    });
    expect(() => service.sendInvitation('user@example.test', 'secret')).toThrow(
      ServiceUnavailableException,
    );
  });
});
