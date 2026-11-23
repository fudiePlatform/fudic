import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/testing', async () => {
  const page = await visit('/docs/reference/testing');
  expect(page.status).toBe(200);
});
