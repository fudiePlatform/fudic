import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/forms/files', async () => {
  const page = await visit('/docs/forms/files');
  expect(page.status).toBe(200);
});
