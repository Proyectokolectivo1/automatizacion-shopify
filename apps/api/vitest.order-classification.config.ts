import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 90_000,
    include: ['test/order-classification.integration.spec.ts'],
    testTimeout: 60_000,
  },
});
