import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools', async () => {
  const page = await visit('/tools');
  expect(page.status).toBe(200);
});
