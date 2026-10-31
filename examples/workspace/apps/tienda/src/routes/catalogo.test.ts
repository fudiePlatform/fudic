import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /catalogo', async () => {
  const page = await visit('/catalogo');
  expect(page.status).toBe(200);
});

test('a pipe of the library paints with the app\'s locale (SDD-71 criterion 13)', async () => {
  const page = await visit('/catalogo');
  expect(page.query('.autora')).toHaveTextContent('Seleccionado por AL');
});
