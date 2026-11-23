import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/service-worker/headers', async () => {
  const page = await visit('/docs/service-worker/headers');
  expect(page.status).toBe(200);
});
