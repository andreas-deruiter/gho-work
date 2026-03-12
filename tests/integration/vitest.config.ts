import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@gho-work/base': resolve(root, 'packages/base/src/index.ts'),
      '@gho-work/platform': resolve(root, 'packages/platform/src/index.ts'),
      '@gho-work/connectors': resolve(root, 'packages/connectors/src/index.ts'),
    },
  },
  test: {
    include: ['**/*.test.ts'],
  },
});
