import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/fix', async () => {
  const page = await visit('/tools/fix');
  expect(page.status).toBe(200);
});
