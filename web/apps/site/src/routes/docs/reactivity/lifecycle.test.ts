import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reactivity/lifecycle', async () => {
  const page = await visit('/docs/reactivity/lifecycle');
  expect(page.status).toBe(200);
});
