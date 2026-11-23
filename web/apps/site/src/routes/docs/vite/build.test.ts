import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/vite/build', async () => {
  const page = await visit('/docs/vite/build');
  expect(page.status).toBe(200);
});
