import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/forms/binding', async () => {
  const page = await visit('/docs/forms/binding');
  expect(page.status).toBe(200);
});
