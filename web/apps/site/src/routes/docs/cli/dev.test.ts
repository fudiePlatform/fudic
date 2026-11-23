import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/dev', async () => {
  const page = await visit('/docs/cli/dev');
  expect(page.status).toBe(200);
});
