import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/vitest-global-setup.ts'],
    projects: ['packages/*', 'tests/integration'],
  },
});
