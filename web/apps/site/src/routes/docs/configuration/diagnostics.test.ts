import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/configuration/diagnostics', async () => {
  const page = await visit('/docs/configuration/diagnostics');
  expect(page.status).toBe(200);
});
