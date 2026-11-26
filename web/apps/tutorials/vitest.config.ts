import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

// Unit tests live next to what they test, as src/**/*.test.ts. A file's first `visit` compiles
// the page, its layout and the server handlers: with some fifty tutorials it passes vitest's 5 s
// on a cold worker, so each test gets 30 s, as in the site app.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true, testTimeout: 30_000 },
});
