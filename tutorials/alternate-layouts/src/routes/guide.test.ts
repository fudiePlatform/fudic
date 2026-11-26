import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /guide', async () => {
  const page = await visit('/guide');
  expect(page.status).toBe(200);
});
