import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /guide/install', async () => {
  const page = await visit('/guide/install');
  expect(page.status).toBe(200);
});
