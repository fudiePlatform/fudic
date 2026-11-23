import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/error-page', async () => {
  const page = await visit('/docs/cli/generate/error-page');
  expect(page.status).toBe(200);
});
