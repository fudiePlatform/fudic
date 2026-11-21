import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/performance/lighthouse', async () => {
  const page = await visit('/docs/performance/lighthouse');
  expect(page.status).toBe(200);
});
