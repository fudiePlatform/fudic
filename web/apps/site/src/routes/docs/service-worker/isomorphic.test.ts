import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/service-worker/isomorphic', async () => {
  const page = await visit('/docs/service-worker/isomorphic');
  expect(page.status).toBe(200);
});
