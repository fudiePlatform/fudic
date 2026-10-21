import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    {
      // What `impl/` imports, as an app's plugin would serve it: the module generated from
      // `fudapi/middlewares.fudapi` (kept in step by a test of @fudic/api), in the variant of
      // the side that imports it.
      name: 'fudic-built-ins',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id !== 'fudic:@fudic/http/middlewares') return null;
        const side = importer?.replace(/\\/gu, '/').includes('/impl/server/') === true ? 'server' : 'browser';
        return here(`./test/generated/middlewares.${side}.ts`);
      },
    },
  ],
  resolve: {
    alias: [{ find: /^@fudic\/http\/contract$/u, replacement: here('./src/contract/index.ts') }],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to look at.
      include: ['src/**/*.ts', 'impl/**/*.ts'],
      exclude: ['**/*.d.ts'],
      thresholds: {
        // New package: born at 100 in the four metrics.
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
