import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/term', async () => {
  const page = await visit('/docs/cli/generate/term');
  expect(page.status).toBe(200);
});
