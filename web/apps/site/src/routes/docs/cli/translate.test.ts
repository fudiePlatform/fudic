import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/translate', async () => {
  const page = await visit('/docs/cli/translate');
  expect(page.status).toBe(200);
});
