import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /approval', async () => {
  const page = await visit('/approval');
  expect(page.status).toBe(200);
});
