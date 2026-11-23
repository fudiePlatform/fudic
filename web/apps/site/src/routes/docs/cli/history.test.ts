import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/history', async () => {
  const page = await visit('/docs/cli/history');
  expect(page.status).toBe(200);
});
