import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /conversation', async () => {
  const page = await visit('/conversation');
  expect(page.status).toBe(200);
});
