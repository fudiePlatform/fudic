import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/preview', async () => {
  const page = await visit('/docs/cli/preview');
  expect(page.status).toBe(200);
});
