import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/getting-started', async () => {
  const page = await visit('/docs/getting-started');
  expect(page.status).toBe(200);
});
