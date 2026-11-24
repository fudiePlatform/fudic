import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/test', async () => {
  const page = await visit('/tools/test');
  expect(page.status).toBe(200);
});
