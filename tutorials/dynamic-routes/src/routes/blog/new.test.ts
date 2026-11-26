import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /blog/new', async () => {
  const page = await visit('/blog/new');
  expect(page.status).toBe(200);
});
