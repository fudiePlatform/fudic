import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

// Unit tests live next to what they test, as src/**/*.test.ts. A file's first `visit` compiles
// the page, its layout and the server handlers, about 4.5 s for a docs page: vitest's 5 s left no
// room, so each test gets 30 s.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true, testTimeout: 30_000 },
});
