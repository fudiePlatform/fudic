import { expect, test, vi } from 'vitest';
import { mount } from '../../src/index.js';
import * as XHello from './src/components/x-hello.fud';

// Criterion 14, the other half: `csrf` with its client half doing nothing. `@fudic/http` registers
// that half from its `browser/` with `csrfClient`; the server half still runs — it is the real
// one — and now it finds no header.
vi.mock('@fudic/http/contract', async (importOriginal) => {
  const contract = await importOriginal<typeof import('@fudic/http/contract')>();
  const passThrough: typeof contract.csrfClient = (ctx, next) => next(ctx);
  return { ...contract, csrfClient: passThrough };
});

test('without its client half, csrf answers 403', async () => {
  const t = await mount(XHello);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('alert')).toHaveTextContent('403');
  expect(t.getByRole('status')).toHaveTextContent('');
});
