import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/add', async () => {
  const page = await visit('/docs/cli/add');
  expect(page.status).toBe(200);
});
