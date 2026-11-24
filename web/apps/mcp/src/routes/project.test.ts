import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /project', async () => {
  const page = await visit('/project');
  expect(page.status).toBe(200);
});
