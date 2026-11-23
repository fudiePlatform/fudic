import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/vite/dev', async () => {
  const page = await visit('/docs/vite/dev');
  expect(page.status).toBe(200);
});
