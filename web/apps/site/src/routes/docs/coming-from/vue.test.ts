import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/coming-from/vue', async () => {
  const page = await visit('/docs/coming-from/vue');
  expect(page.status).toBe(200);
});
