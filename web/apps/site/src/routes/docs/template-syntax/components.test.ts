import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/components', async () => {
  const page = await visit('/docs/template-syntax/components');
  expect(page.status).toBe(200);
});
