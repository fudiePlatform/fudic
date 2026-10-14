// Task 2 of SDD-57, kept as the record of the measurement: in the fudic environment a
// `.fud` imports plain, `?client` and `?server` from one module graph, and a `vi.mock` of the
// test reaches the module that `?server` imports.
import { expect, test, vi } from 'vitest';

vi.mock('./fixtures/spike-data', () => ({ secret: () => 'mocked' }));

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

test('its ?server module imports, and vi.mock reaches what it imports', async () => {
  const server = (await import('./fixtures/spike-card.fud?server')) as Record<string, unknown>;
  const reveal = server['reveal'] as { handle: (ctx: unknown) => unknown };
  expect(reveal.handle({})).toBe('mocked');
});
