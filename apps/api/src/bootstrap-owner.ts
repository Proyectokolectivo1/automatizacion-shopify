import { EnvironmentService } from './config/environment.service';
import { PrismaService } from './database/prisma.service';
import { OwnerBootstrapService } from './identity/owner-bootstrap.service';
import { PasswordService } from './auth/password.service';

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Owner bootstrap does not accept arguments');
  const environment = new EnvironmentService();
  const prisma = new PrismaService(environment);
  try {
    await prisma.$connect();
    const result = await new OwnerBootstrapService(
      environment,
      new PasswordService(),
      prisma,
    ).execute();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  process.stderr.write('Owner bootstrap failed\n');
  process.exitCode = 1;
});
