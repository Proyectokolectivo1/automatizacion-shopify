import { describe, expect, it } from 'vitest';

import type { AuditService } from '../src/auth/audit.service';
import type { AuthPrincipal } from '../src/auth/auth.types';
import type { PasswordService } from '../src/auth/password.service';
import { EnvironmentService } from '../src/config/environment.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import type { PrismaService } from '../src/database/prisma.service';
import { IdentityAdministrationService } from '../src/identity/identity-administration.service';
import { OwnerBootstrapService } from '../src/identity/owner-bootstrap.service';
import type { MetricsService } from '../src/observability/metrics.service';
import type { RequestContextService } from '../src/observability/request-context.service';

loadEnvironmentFiles();

const restoreEnvironment = (name: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

const principal: AuthPrincipal = {
  email: 'owner@example.test',
  organizationId: '1a5b93ac-6b60-46f1-ae70-d7e68992778b',
  role: 'OWNER',
  sessionId: 'bc46343c-986c-438e-86df-fbb3a492b9f0',
  userId: 'c2cff5ff-0e42-4f77-bf4b-b01def0ec0e2',
};

describe('identity operational controls', () => {
  it.each([
    { enabled: 'false', killSwitch: 'false' },
    { enabled: 'true', killSwitch: 'true' },
  ])(
    'fails identity administration closed with $enabled/$killSwitch',
    async ({ enabled, killSwitch }) => {
      const previousEnabled = process.env.IDENTITY_ADMIN_ENABLED;
      const previousKillSwitch = process.env.IDENTITY_ADMIN_KILL_SWITCH;
      process.env.IDENTITY_ADMIN_ENABLED = enabled;
      process.env.IDENTITY_ADMIN_KILL_SWITCH = killSwitch;
      try {
        const service = new IdentityAdministrationService(
          {} as AuditService,
          new EnvironmentService(),
          {} as MetricsService,
          {} as PrismaService,
          {} as RequestContextService,
        );
        await expect(
          service.list({ limit: 25, organizationId: principal.organizationId, principal }),
        ).rejects.toMatchObject({ status: 503 });
      } finally {
        restoreEnvironment('IDENTITY_ADMIN_ENABLED', previousEnabled);
        restoreEnvironment('IDENTITY_ADMIN_KILL_SWITCH', previousKillSwitch);
      }
    },
  );

  it.each([
    { enabled: 'false', killSwitch: 'false' },
    { enabled: 'true', killSwitch: 'true' },
  ])('fails owner bootstrap closed with $enabled/$killSwitch', async ({ enabled, killSwitch }) => {
    const previousEnabled = process.env.IDENTITY_BOOTSTRAP_ENABLED;
    const previousKillSwitch = process.env.IDENTITY_BOOTSTRAP_KILL_SWITCH;
    process.env.IDENTITY_BOOTSTRAP_ENABLED = enabled;
    process.env.IDENTITY_BOOTSTRAP_KILL_SWITCH = killSwitch;
    try {
      const service = new OwnerBootstrapService(
        new EnvironmentService(),
        {} as PasswordService,
        {} as PrismaService,
      );
      await expect(service.execute()).rejects.toMatchObject({ status: 503 });
    } finally {
      restoreEnvironment('IDENTITY_BOOTSTRAP_ENABLED', previousEnabled);
      restoreEnvironment('IDENTITY_BOOTSTRAP_KILL_SWITCH', previousKillSwitch);
    }
  });
});
