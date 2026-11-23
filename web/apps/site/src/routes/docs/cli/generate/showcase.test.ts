import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/showcase', async () => {
  const page = await visit('/docs/cli/generate/showcase');
  expect(page.status).toBe(200);
});
