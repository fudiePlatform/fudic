import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/security/csp', async () => {
  const page = await visit('/docs/security/csp');
  expect(page.status).toBe(200);
});
