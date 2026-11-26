import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/coming-from', async () => {
  const page = await visit('/docs/coming-from');
  expect(page.status).toBe(200);
});
