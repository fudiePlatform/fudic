import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /about', async () => {
  const page = await visit('/about');
  expect(page.status).toBe(200);
});
