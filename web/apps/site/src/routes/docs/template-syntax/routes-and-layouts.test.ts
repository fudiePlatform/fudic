import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/routes-and-layouts', async () => {
  const page = await visit('/docs/template-syntax/routes-and-layouts');
  expect(page.status).toBe(200);
});
