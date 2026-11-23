import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/testing', async () => {
  const page = await visit('/docs/testing');
  expect(page.status).toBe(200);
});
