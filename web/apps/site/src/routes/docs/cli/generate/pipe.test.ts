import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/pipe', async () => {
  const page = await visit('/docs/cli/generate/pipe');
  expect(page.status).toBe(200);
});
