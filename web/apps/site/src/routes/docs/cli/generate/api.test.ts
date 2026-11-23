import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/api', async () => {
  const page = await visit('/docs/cli/generate/api');
  expect(page.status).toBe(200);
});
