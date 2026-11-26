import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/coming-from/react', async () => {
  const page = await visit('/docs/coming-from/react');
  expect(page.status).toBe(200);
});
