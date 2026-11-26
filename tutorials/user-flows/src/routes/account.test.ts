import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /account', async () => {
  const page = await visit('/account');
  expect(page.status).toBe(200);
});
