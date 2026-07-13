import 'reflect-metadata';

import { createApplication } from './app.factory';
import { EnvironmentService } from './config/environment.service';
import { AppLoggerService } from './observability/app-logger.service';

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  const environment = app.get(EnvironmentService);
  const logger = app.get(AppLoggerService);
  await app.listen(environment.apiPort, environment.apiHost);
  logger.event('info', { host: environment.apiHost, port: environment.apiPort }, 'api_started');
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  process.stderr.write(`API bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
