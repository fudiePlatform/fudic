import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/service-worker/caching', async () => {
  const page = await visit('/docs/service-worker/caching');
  expect(page.status).toBe(200);
});
