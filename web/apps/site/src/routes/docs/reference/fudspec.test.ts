import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/fudspec', async () => {
  const page = await visit('/docs/reference/fudspec');
  expect(page.status).toBe(200);
});
