import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/cli/generate/component', async () => {
  const page = await visit('/docs/cli/generate/component');
  expect(page.status).toBe(200);
});
