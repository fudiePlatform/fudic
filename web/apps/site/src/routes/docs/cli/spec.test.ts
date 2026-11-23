import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/spec', async () => {
  const page = await visit('/docs/cli/spec');
  expect(page.status).toBe(200);
});
