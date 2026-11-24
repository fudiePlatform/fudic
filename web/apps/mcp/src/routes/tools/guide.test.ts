import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/guide', async () => {
  const page = await visit('/tools/guide');
  expect(page.status).toBe(200);
});
