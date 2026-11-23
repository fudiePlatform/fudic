import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/configuration/baseline', async () => {
  const page = await visit('/docs/configuration/baseline');
  expect(page.status).toBe(200);
});
