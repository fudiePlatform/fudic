import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/security/trusted-types', async () => {
  const page = await visit('/docs/security/trusted-types');
  expect(page.status).toBe(200);
});
