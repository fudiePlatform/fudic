import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers 403 to /admin', async () => {
  const page = await visit('/admin');
  expect(page.status).toBe(403);
});
