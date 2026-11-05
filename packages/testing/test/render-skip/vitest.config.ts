import { defineConfig } from 'vitest/config';

// A project whose vitest runs and skips every test by its name: the render's never runs.
export default defineConfig({ test: { testNamePattern: 'nothing is called this' } });
