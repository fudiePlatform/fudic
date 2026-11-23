import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/app', async () => {
  const page = await visit('/docs/cli/generate/app');
  expect(page.status).toBe(200);
});
