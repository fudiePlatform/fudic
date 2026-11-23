import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/accept', async () => {
  const page = await visit('/docs/cli/accept');
  expect(page.status).toBe(200);
});
