import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/di', async () => {
  const page = await visit('/docs/di');
  expect(page.status).toBe(200);
});
