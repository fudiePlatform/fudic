// Task 2 of SDD-57, kept as the record of the measurement: in the fudic environment a
// `.fud` imports plain and `?client` from one module graph. Its third half — the `?server`
// module, and a `vi.mock` reaching what it imports — went with `@server` (SDD-60): a handler
// is a `.ts` of `src/server`, and `test/app/server.test.ts` mocks what one reads.
import { expect, test } from 'vitest';

test('the plain module of a .fud imports in the fudic environment', async () => {
  const mod = (await import('./fixtures/spike-card.fud')) as Record<string, unknown>;
  expect(typeof mod['render']).toBe('function');
  expect(mod['tag']).toBe('spike-card');
  expect(typeof document).toBe('object');
});

test('its ?client chunk imports and defines the element', async () => {
  await import('./fixtures/spike-card.fud?client');
  expect(customElements.get('spike-card')).toBeDefined();
});
