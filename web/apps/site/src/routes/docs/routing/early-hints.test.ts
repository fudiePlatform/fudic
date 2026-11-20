import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/routing/early-hints', async () => {
  const page = await visit('/docs/routing/early-hints');
  expect(page.status).toBe(200);
});
