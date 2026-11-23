import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/layout', async () => {
  const page = await visit('/docs/cli/generate/layout');
  expect(page.status).toBe(200);
});
