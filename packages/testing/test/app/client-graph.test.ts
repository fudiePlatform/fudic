import { expect, test, vi } from 'vitest';
import { clientGraphOf, mount } from '../../src/index.js';
import { walk } from '../../src/client-graph.js';
import * as XAlias from './src/components/x-alias.fud';
import * as XEffects from './src/components/x-effects.fud';
import * as XGuarded from './src/components/x-guarded.fud';

// The first walk makes a Vite of its own: about half a second alone, several under a loaded
// parallel run with coverage on.
vi.setConfig({ testTimeout: 20_000 });

test('criterion 18: what the browser gets does not reach the data a server validator reads', async () => {
  const graph = await clientGraphOf(XAlias);
  expect(graph).toReach('src/forms/alias.form.ts');
  expect(graph).toReach('src/forms/messages.ts');
  expect(graph).not.toReach('src/data/aliases.ts');
});

test('criterion 18: without the plugin erasing it, it does', async () => {
  const unerased = await walk(XAlias.$file, true);
  expect(unerased).toReach('src/data/aliases.ts');
});

test('a failing toReach lists what the graph does reach', async () => {
  const graph = await clientGraphOf(XAlias);
  expect(() => expect(graph).toReach('src/nowhere.ts')).toThrow('does not reach src/nowhere.ts');
  expect(() => expect(graph).not.toReach('src/forms/alias.form.ts')).toThrow('reaches src/forms/alias.form.ts, and it should not');
});

test('BUG-47: a module only the erased half imported no longer ships, effects and all', async () => {
  // The client transform erases `auth`'s `.server` half and, with it, the import of `Tokens`
  // that only that half used. `tokens.ts` ends in `Service(Tokens)`, so a bundler would keep it
  // whole if the import stayed: it does not stay.
  const graph = await clientGraphOf(XGuarded);
  expect(graph).toReach('src/middlewares/auth.ts');
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
