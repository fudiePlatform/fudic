import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /roles', async () => {
  const page = await visit('/roles');
  expect(page.status).toBe(200);
});
