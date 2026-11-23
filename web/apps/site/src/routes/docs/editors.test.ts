import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/editors', async () => {
  const page = await visit('/docs/editors');
  expect(page.status).toBe(200);
});
