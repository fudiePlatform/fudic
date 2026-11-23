import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/http', async () => {
  const page = await visit('/docs/reference/http');
  expect(page.status).toBe(200);
});
