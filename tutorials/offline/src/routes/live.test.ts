import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /live', async () => {
  const page = await visit('/live');
  expect(page.status).toBe(200);
});
