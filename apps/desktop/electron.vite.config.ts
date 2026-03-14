import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Workspace packages must be bundled — they are TypeScript source, not compiled
        exclude: ['@gho-work/base', '@gho-work/platform', '@gho-work/agent', '@gho-work/connectors', '@gho-work/ui', '@gho-work/electron'],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          agentHost: resolve(__dirname, '../../packages/electron/src/agentHost/agentHostMain.ts'),
        },
        external: ['better-sqlite3', '@github/copilot-sdk', '@modelcontextprotocol/sdk'],
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@gho-work/base', '@gho-work/platform', '@gho-work/agent', '@gho-work/connectors', '@gho-work/ui', '@gho-work/electron'],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@gho-work/base': resolve(__dirname, '../../packages/base/src/index.ts'),
        '@gho-work/platform/common': resolve(__dirname, '../../packages/platform/src/common.ts'),
        '@gho-work/platform': resolve(__dirname, '../../packages/platform/src/index.ts'),
        '@gho-work/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
