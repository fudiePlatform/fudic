import { expect, test } from 'vitest';
import { visit } from '../../../../src/index.js';

// An app under `/admin/` with no `_error.fud` of its own, whose library `@fixture/ui` offers one
// (SDD-87 §3.2, task 13): the harness discovers it as the build does. Criterion 11: its home is
// the app's base.

test('a load that throws paints the page of the library, with home at the base', async () => {
  const page = await visit('/admin/missing');
  expect(page.status).toBe(404);
  expect(page.document.title).toBe('ui 404');
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('404 · Not Found');
  expect(page.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/admin/');
});
