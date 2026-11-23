import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/configuration/generated', async () => {
  const page = await visit('/docs/configuration/generated');
  expect(page.status).toBe(200);
});
