import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/symbols', async () => {
  const page = await visit('/tools/symbols');
  expect(page.status).toBe(200);
});
