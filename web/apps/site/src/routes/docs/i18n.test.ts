import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/i18n', async () => {
  const page = await visit('/docs/i18n');
  expect(page.status).toBe(200);
});
