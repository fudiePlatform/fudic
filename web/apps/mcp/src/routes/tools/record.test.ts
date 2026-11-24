import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/record', async () => {
  const page = await visit('/tools/record');
  expect(page.status).toBe(200);
});
