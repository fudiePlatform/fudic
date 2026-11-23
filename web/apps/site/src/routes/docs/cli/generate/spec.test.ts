import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/spec', async () => {
  const page = await visit('/docs/cli/generate/spec');
  expect(page.status).toBe(200);
});
