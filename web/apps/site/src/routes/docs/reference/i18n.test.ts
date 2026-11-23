import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/i18n', async () => {
  const page = await visit('/docs/reference/i18n');
  expect(page.status).toBe(200);
});
