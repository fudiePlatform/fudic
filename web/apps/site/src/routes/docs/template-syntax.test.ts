import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax', async () => {
  const page = await visit('/docs/template-syntax');
  expect(page.status).toBe(200);
});
