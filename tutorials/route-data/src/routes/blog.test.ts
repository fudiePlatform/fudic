import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /blog', async () => {
  const page = await visit('/blog');
  expect(page.status).toBe(200);
});
