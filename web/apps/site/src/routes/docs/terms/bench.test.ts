import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/terms/bench', async () => {
  const page = await visit('/docs/terms/bench');
  expect(page.status).toBe(200);
});
