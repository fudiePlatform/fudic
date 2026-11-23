import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/service', async () => {
  const page = await visit('/docs/cli/generate/service');
  expect(page.status).toBe(200);
});
