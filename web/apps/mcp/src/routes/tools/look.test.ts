import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/look', async () => {
  const page = await visit('/tools/look');
  expect(page.status).toBe(200);
});
