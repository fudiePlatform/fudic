import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /menu', async () => {
  const page = await visit('/menu');
  expect(page.status).toBe(200);
});
