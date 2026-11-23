import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/di', async () => {
  const page = await visit('/docs/reference/di');
  expect(page.status).toBe(200);
});
