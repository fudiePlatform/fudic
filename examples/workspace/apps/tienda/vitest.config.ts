import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

// Unit tests live next to what they test, as src/**/*.test.ts.
export default defineConfig({
  plugins: [fudicTest()],
  test: { include: ['src/**/*.test.ts'], passWithNoTests: true },
});
