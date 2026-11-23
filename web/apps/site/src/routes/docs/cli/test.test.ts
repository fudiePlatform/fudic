import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/test', async () => {
  const page = await visit('/docs/cli/test');
  expect(page.status).toBe(200);
});
