import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/coming-from/angular', async () => {
  const page = await visit('/docs/coming-from/angular');
  expect(page.status).toBe(200);
});
