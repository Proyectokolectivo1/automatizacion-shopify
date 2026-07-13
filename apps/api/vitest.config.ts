import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: [
        'src/config/environment.schema.ts',
        'src/health/health.service.ts',
        'src/observability/correlation-id.ts',
        'src/observability/logger.factory.ts',
      ],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90,
      },
    },
    environment: 'node',
    exclude: ['test/**/*.integration.spec.ts'],
    include: ['test/**/*.spec.ts'],
  },
});
