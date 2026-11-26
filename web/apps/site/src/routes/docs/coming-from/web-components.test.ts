import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/coming-from/web-components', async () => {
  const page = await visit('/docs/coming-from/web-components');
  expect(page.status).toBe(200);
});
