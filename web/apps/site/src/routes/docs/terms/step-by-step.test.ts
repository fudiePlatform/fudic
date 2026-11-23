import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/terms/step-by-step', async () => {
  const page = await visit('/docs/terms/step-by-step');
  expect(page.status).toBe(200);
});
