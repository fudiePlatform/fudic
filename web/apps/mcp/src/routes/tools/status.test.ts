import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/status', async () => {
  const page = await visit('/tools/status');
  expect(page.status).toBe(200);
});
