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

// SDD-60 §4.4: this package declares no `.fudapi`, so there is no server root and no function to
// call — a function URL gets the 404 the dispatcher of an app would give.
test('a function URL in a project without a .fudapi is a 404', async () => {
  // Without a function there is no chain to read a format from: JSON to whoever accepts it.
  const response = await fetch('/_fudic/fn/routes/x/save', { method: 'PUT', headers: { accept: 'application/json' } });
  expect(response.status).toBe(404);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  expect(await response.json()).toEqual({ status: 404, title: 'Not Found', detail: 'no such server function' });
});
