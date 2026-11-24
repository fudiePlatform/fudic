import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /tools/spec-run', async () => {
  const page = await visit('/tools/spec-run');
  expect(page.status).toBe(200);
});
