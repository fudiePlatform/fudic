import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/performance', async () => {
  const page = await visit('/docs/performance');
  expect(page.status).toBe(200);
});
