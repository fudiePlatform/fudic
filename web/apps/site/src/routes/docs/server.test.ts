import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server', async () => {
  const page = await visit('/docs/server');
  expect(page.status).toBe(200);
});
