import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/fudapi', async () => {
  const page = await visit('/docs/reference/fudapi');
  expect(page.status).toBe(200);
});
