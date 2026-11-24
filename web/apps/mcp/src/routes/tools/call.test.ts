import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/call', async () => {
  const page = await visit('/tools/call');
  expect(page.status).toBe(200);
});
