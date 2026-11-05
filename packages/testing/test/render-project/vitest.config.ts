import { defineConfig } from 'vitest/config';
import { fudicTest } from '../../src/config.js';

// A project as `renderPiece` meets one: its own config, and nothing of its own to test. The
// package's own config never picks this folder up.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['tests/**/*.test.ts'] },
});
