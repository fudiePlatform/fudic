import { expect, test, vi } from 'vitest';
import { visit } from '@fudic/testing';

// SDD-70 criterion 22, the part a test can see: every block of the page is painted where its
// `@await` is, the counter of the first one answers to clicks, the one that fails paints its
// `@catch`, and no block of hydration nor any part marker is left in the document. That it goes
// out part by part is the browser test of criterion 22, which Pedro does.

// The waits of `src/server/espera.ts`, shortened: the page is the same, only sooner.
vi.mock('../server/espera', async () => {
  const { notFound } = await import('@fudic/http');
  const { load } = await import('fudic:routes/espera');
  load.handle(() => ({
    title: 'Lo que tarda, llega después',
    inicio: Promise.resolve(10),
    resumen: Promise.resolve({ personas: 12, activas: 9 }),
    roto: Promise.reject(notFound('el servicio de avisos no responde')),
  }));
  return {};
});

test('every block is painted in its place, and the one that fails shows its @catch', async () => {
  const page = await visit('/espera');
  expect(page.status).toBe(200);
  expect(document.querySelector('h1')).toHaveTextContent('Lo que tarda, llega después');
  expect(document.body).toHaveTextContent('9 de 12 personas están activas.');
  expect(document.body).toHaveTextContent('No se pudo cargar (404 Not Found).');

  const counter = document.querySelector('app-counter')!;
  const output = (): string => counter.shadowRoot!.querySelector('output')!.textContent ?? '';
  expect(output()).toBe('10');
  await page.click(counter.shadowRoot!.querySelector('button')!);
  expect(output()).toBe('11');

  expect(document.querySelector('script[data-fud-part]')).toBeNull();
  expect(document.body.innerHTML).not.toContain('fud-end');
});
