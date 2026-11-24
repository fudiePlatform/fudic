import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/generate', async () => {
  const page = await visit('/tools/generate');
  expect(page.status).toBe(200);
});
