import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/vite', async () => {
  const page = await visit('/docs/vite');
  expect(page.status).toBe(200);
});
