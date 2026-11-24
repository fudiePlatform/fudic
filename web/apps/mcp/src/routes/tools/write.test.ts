import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/write', async () => {
  const page = await visit('/tools/write');
  expect(page.status).toBe(200);
});
