import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/fmt', async () => {
  const page = await visit('/docs/cli/fmt');
  expect(page.status).toBe(200);
});
