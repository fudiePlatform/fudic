import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reactivity', async () => {
  const page = await visit('/docs/reactivity');
  expect(page.status).toBe(200);
});
