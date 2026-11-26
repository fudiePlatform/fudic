import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
});
