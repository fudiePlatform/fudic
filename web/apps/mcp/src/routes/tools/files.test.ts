import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/files', async () => {
  const page = await visit('/tools/files');
  expect(page.status).toBe(200);
});
