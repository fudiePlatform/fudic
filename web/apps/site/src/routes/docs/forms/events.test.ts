import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/forms/events', async () => {
  const page = await visit('/docs/forms/events');
  expect(page.status).toBe(200);
});
