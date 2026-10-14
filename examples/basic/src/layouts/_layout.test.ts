import { expect, test } from 'vitest';
import { renderLayout } from '@fudic/testing';
import * as Layout from './_layout.fud';

test('Spanish by default, with the body and the nav where they go', async () => {
  const page = await renderLayout(Layout, {
    body: '<p>cuerpo</p>',
    sections: { nav: '<a href="/">Inicio</a>' },
  });
  expect(page.document.documentElement.lang).toBe('es');
  expect(page.query('main')).toHaveTextContent('cuerpo');
  expect(page.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
  expect(page.query('footer.site')).toBeInTheDocument();
});

test('a culture given replaces the default', async () => {
  const page = await renderLayout(Layout, { props: { culture: 'en' }, head: '<title>T</title>' });
  expect(page.document.documentElement.lang).toBe('en');
  expect(page.document.title).toBe('T');
});
