import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/tools/format', async () => {
  const page = await visit('/docs/tools/format');
  expect(page.status).toBe(200);
});
