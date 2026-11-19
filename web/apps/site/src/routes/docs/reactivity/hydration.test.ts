import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reactivity/hydration', async () => {
  const page = await visit('/docs/reactivity/hydration');
  expect(page.status).toBe(200);
});
