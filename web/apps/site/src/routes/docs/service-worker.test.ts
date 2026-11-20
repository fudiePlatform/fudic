import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/service-worker', async () => {
  const page = await visit('/docs/service-worker');
  expect(page.status).toBe(200);
});
