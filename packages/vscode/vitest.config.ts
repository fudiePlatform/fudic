import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests happened to import:
      // a file no test reaches must show as 0%, never be invisible. Test helpers stay out.
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      // `vscode` only exists inside the extension host: it cannot be imported under Node.
      // Every module under src/ takes the host API through a port, so this double is only
      // needed by the one adapter that does import it — and with the alias in place that
      // adapter still loads, and still counts towards coverage.
      vscode: fileURLToPath(new URL('./test/_vscode-stub.ts', import.meta.url)),
    },
  },
});
