import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

// The unit tests live beside what they test (`src/**/*.test.ts`) and run in happy-dom with the
// server's HTML and the browser's hydration. `tests/` is Playwright's, against the built app.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['src/**/*.test.ts'] },
});
