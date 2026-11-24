import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/format', async () => {
  const page = await visit('/tools/format');
  expect(page.status).toBe(200);
});
