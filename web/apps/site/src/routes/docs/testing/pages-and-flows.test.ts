import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/testing/pages-and-flows', async () => {
  const page = await visit('/docs/testing/pages-and-flows');
  expect(page.status).toBe(200);
});
