import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/transport-rate.integration.spec.ts'],
    maxWorkers: 1,
    testTimeout: 60_000,
  },
});
