import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/snippets', async () => {
  const page = await visit('/docs/template-syntax/snippets');
  expect(page.status).toBe(200);
});
