import { expect, test } from 'vitest';
import { renderLayout, visit } from '../../src/index.js';
import * as Layout from './src/layouts/_layout.fud';

// A project with neither `_error.fud` nor `src/http.fudapi`, served under `/sub/`: what the harness
// does without them, and with a base.

test('without _error.fud, a 404 paints the minimal page of the dev server', async () => {
  const page = await visit('/sub/missing');
  expect(page.status).toBe(404);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('404');
});

test('a URL outside the base is matched as it is, and nothing matches it', async () => {
  await expect(visit('/elsewhere')).rejects.toThrow("visit('/elsewhere'): no route matches /elsewhere");
});

test('without src/http.fudapi, a layout paints with no global chain', async () => {
  const page = await renderLayout(Layout, { body: '<p>bare</p>' });
  expect(page.query('main p')).toHaveTextContent('bare');
});
