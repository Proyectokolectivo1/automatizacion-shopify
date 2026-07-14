import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PASSWORD_PARAMETERS, PasswordService } from '../auth/password.service';
import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';

export interface OwnerBootstrapResult {
  readonly status: 'already_initialized' | 'initialized';
}

@Injectable()
export class OwnerBootstrapService {
  public constructor(
    private readonly environment: EnvironmentService,
    private readonly password: PasswordService,
    private readonly prisma: PrismaService,
  ) {}

  public async execute(): Promise<OwnerBootstrapResult> {
    const configuration = this.environment.identityBootstrap;
    if (
      !configuration.enabled ||
      configuration.killSwitch ||
      configuration.secret === undefined ||
      configuration.email === undefined ||
      configuration.password === undefined ||
      configuration.organizationName === undefined
    ) {
      throw new ServiceUnavailableException('Owner bootstrap is disabled or incomplete');
    }

    const email = configuration.email;
    const organizationName = configuration.organizationName;
    const password = configuration.password;
    const passwordHash = await this.password.hash(password);
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtextextended('identity.owner.bootstrap', 0))
          `;
          if ((await transaction.user.count()) > 0) {
            await transaction.auditLog.create({
              data: {
                action: 'identity.bootstrap.skipped',
                correlationId: 'identity-bootstrap',
                metadataJson: { reason: 'already_initialized' },
                outcome: 'DENIED',
                resourceType: 'identity_bootstrap',
              },
            });
            return { status: 'already_initialized' };
          }

          const organization = await transaction.organization.create({
            data: { name: organizationName },
          });
          const user = await transaction.user.create({
            data: {
              email: email.toLowerCase(),
              memberships: {
                create: { organizationId: organization.id, role: 'OWNER' },
              },
              passwordAlgorithm: PASSWORD_PARAMETERS.algorithm,
              passwordHash,
              passwordParametersJson: PASSWORD_PARAMETERS,
            },
          });
          await transaction.auditLog.create({
            data: {
              action: 'identity.bootstrap.owner_created',
              actorUserId: user.id,
              correlationId: 'identity-bootstrap',
              metadataJson: { role: 'OWNER' },
              organizationId: organization.id,
              outcome: 'SUCCESS',
              resourceId: user.id,
              resourceType: 'user',
            },
          });
          return { status: 'initialized' };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSerializationConflict(error) || retry === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
      }
    }
    throw new Error('Serializable transaction retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    const metadata = error.meta as { code?: string } | undefined;
    return (
      error.code === 'P2010' && (metadata?.code === '40001' || error.message.includes('40001'))
    );
  }
}
