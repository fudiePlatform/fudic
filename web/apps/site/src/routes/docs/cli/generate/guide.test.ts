import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/guide', async () => {
  const page = await visit('/docs/cli/generate/guide');
  expect(page.status).toBe(200);
});
