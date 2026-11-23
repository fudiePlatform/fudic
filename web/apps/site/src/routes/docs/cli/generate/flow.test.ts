import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/flow', async () => {
  const page = await visit('/docs/cli/generate/flow');
  expect(page.status).toBe(200);
});
