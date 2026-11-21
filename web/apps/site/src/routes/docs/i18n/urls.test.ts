import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/i18n/urls', async () => {
  const page = await visit('/docs/i18n/urls');
  expect(page.status).toBe(200);
});
