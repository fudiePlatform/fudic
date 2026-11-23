import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/security/headers', async () => {
  const page = await visit('/docs/security/headers');
  expect(page.status).toBe(200);
});
