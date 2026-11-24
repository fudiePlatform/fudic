import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/read', async () => {
  const page = await visit('/tools/read');
  expect(page.status).toBe(200);
});
