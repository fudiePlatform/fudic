import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/service-worker/configuration', async () => {
  const page = await visit('/docs/service-worker/configuration');
  expect(page.status).toBe(200);
});
