import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

// A project as `callFunction` meets one: its config takes fudicTest() from the installed package,
// so the environment and the call the generated file imports are the same modules, as in a real
// project. The package's own config never picks this folder up.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['tests/**/*.test.ts'] },
});
