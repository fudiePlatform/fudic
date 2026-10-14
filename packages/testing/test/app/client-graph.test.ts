import { expect, test, vi } from 'vitest';
import { clientGraphOf, mount } from '../../src/index.js';
import { walk } from '../../src/client-graph.js';
import * as XAlias from './src/components/x-alias.fud';
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

test('BUG-47: a module the erased half imported still ships when it has top-level effects', async () => {
  // The client transform erases `auth`'s `.server` half, but not the import of `Tokens` it
  // used, and `tokens.ts` ends in `Service(Tokens)`: a bundler keeps it whole. This documents
  // BUG-47 (docs/sdd/bugs/BUG-47-lo-que-el-navegador-no-deberia-ver.md §2.1). When BUG-47 takes
  // the orphaned imports out, this flips to `not.toReach`.
  const graph = await clientGraphOf(XGuarded);
  expect(graph).toReach('src/middlewares/auth.ts');
  expect(graph).toReach('src/data/tokens.ts');
});

test('the middleware still works across the two sides', async () => {
  const t = await mount(XGuarded);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('ana');
});
