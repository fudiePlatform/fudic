import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /phases', async () => {
  const page = await visit('/phases');
  expect(page.status).toBe(200);
});
