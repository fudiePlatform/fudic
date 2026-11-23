import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/style', async () => {
  const page = await visit('/docs/cli/generate/style');
  expect(page.status).toBe(200);
});
