import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/dom', async () => {
  const page = await visit('/docs/reference/dom');
  expect(page.status).toBe(200);
});
