import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/styles', async () => {
  const page = await visit('/docs/styles');
  expect(page.status).toBe(200);
});
