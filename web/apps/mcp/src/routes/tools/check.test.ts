import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/check', async () => {
  const page = await visit('/tools/check');
  expect(page.status).toBe(200);
});
