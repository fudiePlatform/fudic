import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /fudic', async () => {
  const page = await visit('/fudic');
  expect(page.status).toBe(200);
});
