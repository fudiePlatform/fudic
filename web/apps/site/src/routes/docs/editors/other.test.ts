import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/editors/other', async () => {
  const page = await visit('/docs/editors/other');
  expect(page.status).toBe(200);
});
