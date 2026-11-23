import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/testing/unit', async () => {
  const page = await visit('/docs/testing/unit');
  expect(page.status).toBe(200);
});
