import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/contract', async () => {
  const page = await visit('/tools/contract');
  expect(page.status).toBe(200);
});
