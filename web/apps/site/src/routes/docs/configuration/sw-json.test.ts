import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/configuration/sw-json', async () => {
  const page = await visit('/docs/configuration/sw-json');
  expect(page.status).toBe(200);
});
