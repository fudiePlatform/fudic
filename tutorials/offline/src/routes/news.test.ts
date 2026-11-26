import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /news', async () => {
  const page = await visit('/news');
  expect(page.status).toBe(200);
});
