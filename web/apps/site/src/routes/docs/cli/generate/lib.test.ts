import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/lib', async () => {
  const page = await visit('/docs/cli/generate/lib');
  expect(page.status).toBe(200);
});
