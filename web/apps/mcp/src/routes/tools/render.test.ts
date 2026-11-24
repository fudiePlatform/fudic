import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/render', async () => {
  const page = await visit('/tools/render');
  expect(page.status).toBe(200);
});
