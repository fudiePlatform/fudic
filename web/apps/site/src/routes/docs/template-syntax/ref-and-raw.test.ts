import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/ref-and-raw', async () => {
  const page = await visit('/docs/template-syntax/ref-and-raw');
  expect(page.status).toBe(200);
});
