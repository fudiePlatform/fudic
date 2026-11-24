import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /connect/chat', async () => {
  const page = await visit('/connect/chat');
  expect(page.status).toBe(200);
});
