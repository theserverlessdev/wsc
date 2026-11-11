import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'istanbul',
      all: true,
      include: [
        'src/core/detector.ts',
        'src/core/words.ts',
        'src/core/config.ts',
        'src/core/config-node.ts',
        'src/core/analyzer.ts',
        'src/core/markdown.ts',
        'src/core/linecol.ts',
        'src/mcp/handler.ts',
        'src/routes/api/check/+server.ts',
        'src/routes/mcp/+server.ts',
        'mcp-server/server.ts',
        // Entry points excluded: small wrappers that block on stdin/transport
      ],
      thresholds: {
        statements: 95,
        functions: 95,
        lines: 95,
        branches: 93,
      },
    },
  },
  resolve: {
    alias: {
      '$app/environment': '/tests/__mocks__/$app/environment.ts',
    },
  },
});
