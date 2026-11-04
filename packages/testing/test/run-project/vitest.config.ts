import { defineConfig } from 'vitest/config';
import { fudicTest } from '../../src/config.js';

// A project as `runTests` meets one: its own config, its own tests — some red on purpose. The
// package's own config never picks these up: its projects include none of this folder.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['tests/**/*.test.ts'] },
});
