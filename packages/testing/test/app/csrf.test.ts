import { expect, test, vi } from 'vitest';
import { mount } from '../../src/index.js';
import * as XHello from './src/components/x-hello.fud';

// Criterion 14, the other half: `csrf` with its `.client` half taken out. The server half still
// runs — it is the real one — and now it finds no header.
vi.mock('@fudic/http', async (importOriginal) => {
  const http = await importOriginal<typeof import('@fudic/http')>();
  const server = (http.csrf as unknown as { readonly s: Parameters<ReturnType<typeof http.middleware>['server']>[0] }).s;
  return { ...http, csrf: http.middleware().server(server) };
});

test('without its client half, csrf answers 403', async () => {
  const t = await mount(XHello);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('alert')).toHaveTextContent('403');
  expect(t.getByRole('status')).toHaveTextContent('');
});
