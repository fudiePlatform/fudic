import { expect, test } from 'vitest';
import { renderSnippet } from '@fudic/testing';

test('header renders the wordmark and the main navigation', async () => {
  const t = await renderSnippet('./site.fud', 'header()');
  expect(t.query('.site-header')).toBeInTheDocument();
  expect(t.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  expect(t.getByRole('link', { name: 'Documentación' })).toHaveAttribute('href', '/docs/getting-started');
});

test('footer renders', async () => {
  const t = await renderSnippet('./site.fud', 'footer()');
  expect(t.query('.site-footer')).toBeInTheDocument();
});

test('docsNav marks the current chapter', async () => {
  const t = await renderSnippet('./site.fud', 'docsNav("getting-started")');
  expect(t.getByRole('link', { name: 'Empezar' })).toHaveAttribute('aria-current', 'page');
});

test('docsNav marks nothing on another page', async () => {
  const t = await renderSnippet('./site.fud', 'docsNav("elsewhere")');
  expect(t.getByRole('link', { name: 'Empezar' })).not.toHaveAttribute('aria-current');
});
