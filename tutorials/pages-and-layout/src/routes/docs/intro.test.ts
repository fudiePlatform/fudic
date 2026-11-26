import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/intro', async () => {
  const page = await visit('/docs/intro');
  expect(page.status).toBe(200);
});
