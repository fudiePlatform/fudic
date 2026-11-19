import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/expressions', async () => {
  const page = await visit('/docs/template-syntax/expressions');
  expect(page.status).toBe(200);
});
