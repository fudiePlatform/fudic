import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/editors/writing', async () => {
  const page = await visit('/docs/editors/writing');
  expect(page.status).toBe(200);
});
