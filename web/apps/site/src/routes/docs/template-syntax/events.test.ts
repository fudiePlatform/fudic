import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/events', async () => {
  const page = await visit('/docs/template-syntax/events');
  expect(page.status).toBe(200);
});
