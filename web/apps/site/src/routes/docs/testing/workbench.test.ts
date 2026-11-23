import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/testing/workbench', async () => {
  const page = await visit('/docs/testing/workbench');
  expect(page.status).toBe(200);
});
