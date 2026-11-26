import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /en/ and /es/, each in its language', async () => {
  const en = await visit('/en/');
  expect(en.getByRole('heading', { level: 1 })).toHaveTextContent('Home');
  const es = await visit('/es/');
  expect(es.getByRole('heading', { level: 1 })).toHaveTextContent('Inicio');
});
