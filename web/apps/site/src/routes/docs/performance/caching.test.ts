import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/performance/caching', async () => {
  const page = await visit('/docs/performance/caching');
  expect(page.status).toBe(200);
});
