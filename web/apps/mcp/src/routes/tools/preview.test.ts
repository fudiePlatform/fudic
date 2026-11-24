import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/preview', async () => {
  const page = await visit('/tools/preview');
  expect(page.status).toBe(200);
});
