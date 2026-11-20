import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server/task', async () => {
  const page = await visit('/docs/server/task');
  expect(page.status).toBe(200);
});
