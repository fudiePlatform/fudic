import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /blog/hello', async () => {
  const page = await visit('/blog/hello');
  expect(page.status).toBe(200);
});

test('answers 404 for a post that does not exist', async () => {
  const page = await visit('/blog/nope');
  expect(page.status).toBe(404);
});
