import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /en/ and /es/', async () => {
  expect((await visit('/en/')).status).toBe(200);
  expect((await visit('/es/')).status).toBe(200);
});
