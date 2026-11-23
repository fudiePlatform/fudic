import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/new', async () => {
  const page = await visit('/docs/cli/new');
  expect(page.status).toBe(200);
});
