import { expect, test } from 'vitest';
import * as SpikeCard from './fixtures/spike-card.fud';

// Criterion 1: this package's own `vitest.config.ts` is `fudicTest()` and nothing else that
// matters, so this file runs exactly where a project's test would.
test('a .fud imports from a test, which runs in the fudic environment', () => {
  expect(SpikeCard.tag).toBe('spike-card');
  expect(expect.getState().environment).toBe('fudic');
  expect(import.meta.env.SSR).toBe(true);
  expect(document.location.href).toBe('http://localhost/');
});
