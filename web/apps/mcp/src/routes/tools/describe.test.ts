import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/describe', async () => {
  const page = await visit('/tools/describe');
  expect(page.status).toBe(200);
});
