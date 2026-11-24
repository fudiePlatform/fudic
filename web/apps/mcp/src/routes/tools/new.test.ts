import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/new', async () => {
  const page = await visit('/tools/new');
  expect(page.status).toBe(200);
});
