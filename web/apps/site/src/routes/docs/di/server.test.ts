import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/di/server', async () => {
  const page = await visit('/docs/di/server');
  expect(page.status).toBe(200);
});
