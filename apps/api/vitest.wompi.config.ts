import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['test/wompi-provider.spec.ts', 'test/payment-intent.integration.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
