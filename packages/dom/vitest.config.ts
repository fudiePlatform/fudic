import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // browserDom and Cursor wrap the real DOM API; happy-dom provides it.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // The contract + browser adapter are thin and fully exercisable: aim high.
        lines: 95,
        functions: 95,
        branches: 90,
      },
    },
  },
});
