import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli', async () => {
  const page = await visit('/docs/cli');
  expect(page.status).toBe(200);
});
