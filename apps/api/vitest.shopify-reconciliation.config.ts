import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 90_000,
    include: [
      'test/shopify-reconciliation.integration.spec.ts',
      'test/shopify-reconciliation-scheduler.spec.ts',
    ],
    testTimeout: 60_000,
  },
});
