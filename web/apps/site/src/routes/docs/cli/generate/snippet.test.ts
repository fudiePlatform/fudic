import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/snippet', async () => {
  const page = await visit('/docs/cli/generate/snippet');
  expect(page.status).toBe(200);
});
