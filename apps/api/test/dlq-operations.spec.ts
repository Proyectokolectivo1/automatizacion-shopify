import { describe, expect, it } from 'vitest';

import type { AuditService } from '../src/auth/audit.service';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { EnvironmentService } from '../src/config/environment.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import type { PrismaService } from '../src/database/prisma.service';
import { DlqOperationsService } from '../src/outbox/dlq-operations.service';

loadEnvironmentFiles();

const principal: AuthPrincipal = {
  email: 'owner@example.test',
  organizationId: '1a5b93ac-6b60-46f1-ae70-d7e68992778b',
  role: 'OWNER',
  sessionId: 'bc46343c-986c-438e-86df-fbb3a492b9f0',
  userId: 'c2cff5ff-0e42-4f77-bf4b-b01def0ec0e2',
};

describe('DLQ operational controls', () => {
  it.each([
    { enabled: 'false', killSwitch: 'false' },
    { enabled: 'true', killSwitch: 'true' },
  ])('fails closed with controls $enabled/$killSwitch', async ({ enabled, killSwitch }) => {
    const previousEnabled = process.env.OUTBOX_OPERATIONS_ENABLED;
    const previousKillSwitch = process.env.OUTBOX_OPERATIONS_KILL_SWITCH;
    process.env.OUTBOX_OPERATIONS_ENABLED = enabled;
    process.env.OUTBOX_OPERATIONS_KILL_SWITCH = killSwitch;
    try {
      const service = new DlqOperationsService(
        {} as AuditService,
        new EnvironmentService(),
        {} as PrismaService,
      );
      await expect(
        service.inspect({ limit: 25, organizationId: principal.organizationId, principal }),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      process.env.OUTBOX_OPERATIONS_ENABLED = previousEnabled;
      process.env.OUTBOX_OPERATIONS_KILL_SWITCH = previousKillSwitch;
    }
  });
});
