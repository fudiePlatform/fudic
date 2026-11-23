import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/approve', async () => {
  const page = await visit('/docs/cli/approve');
  expect(page.status).toBe(200);
});
