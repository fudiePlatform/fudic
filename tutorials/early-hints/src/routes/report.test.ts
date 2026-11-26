import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /report', async () => {
  const page = await visit('/report');
  expect(page.status).toBe(200);
});
