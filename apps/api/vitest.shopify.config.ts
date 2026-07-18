import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 90_000,
    include: [
      'test/shopify-integration.integration.spec.ts',
      'test/shopify-live-provider.spec.ts',
      'test/shopify-order-action.spec.ts',
    ],
    testTimeout: 60_000,
  },
});
