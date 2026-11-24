import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/add', async () => {
  const page = await visit('/tools/add');
  expect(page.status).toBe(200);
});
