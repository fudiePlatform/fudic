import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/await', async () => {
  const page = await visit('/docs/template-syntax/await');
  expect(page.status).toBe(200);
});
