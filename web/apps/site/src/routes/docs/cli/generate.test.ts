import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate', async () => {
  const page = await visit('/docs/cli/generate');
  expect(page.status).toBe(200);
});
