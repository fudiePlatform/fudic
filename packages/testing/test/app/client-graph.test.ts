import { expect, test, vi } from 'vitest';
import { clientGraphOf, mount } from '../../src/index.js';
import * as XAlias from './src/components/x-alias.fud';
import * as XEffects from './src/components/x-effects.fud';
import * as XGuarded from './src/components/x-guarded.fud';

// The first walk makes a Vite of its own: about half a second alone, several under a loaded
// parallel run with coverage on.
vi.setConfig({ testTimeout: 20_000 });

test('criterion 18: what the browser gets does not reach the data a server rule reads', async () => {
  // The rule `alias-taken` runs on the server: its check lives in `src/server`, which no
  // browser module imports (SDD-60 §3.12).
  const graph = await clientGraphOf(XAlias);
  expect(graph).not.toReach('src/server/rules.ts');
  expect(graph).not.toReach('src/data/aliases.ts');
});

test('a failing toReach lists what the graph does reach', async () => {
  const graph = await clientGraphOf(XEffects);
  expect(() => expect(graph).toReach('src/nowhere.ts')).toThrow('does not reach src/nowhere.ts');
  expect(() => expect(graph).not.toReach('src/data/forward.js')).toThrow('reaches src/data/forward.js, and it should not');
});

test('BUG-47: the server half of a middleware, and what only it imports, never ship', async () => {
  // `tokens.ts` ends in `Service(Tokens)`, so a bundler would keep it whole if anything the
  // browser loads imported it: the half that reads it is in `src/server`.
  const graph = await clientGraphOf(XGuarded);
  expect(graph).not.toReach('src/server/auth.ts');
  expect(graph).not.toReach('src/data/tokens.ts');
});

test('an import whose names nothing uses is followed only when its module has effects', async () => {
  const graph = await clientGraphOf(XEffects);
  expect(graph).toReach('src/data/forward.js');
  expect(graph).toReach('src/data/effectful.ts');
  expect(graph).not.toReach('src/data/quiet.ts');
});

test('the middleware still works across the two sides', async () => {
  const t = await mount(XGuarded);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('ana');
});
