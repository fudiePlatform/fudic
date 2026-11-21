import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/di/providers', async () => {
  const page = await visit('/docs/di/providers');
  expect(page.status).toBe(200);
});
