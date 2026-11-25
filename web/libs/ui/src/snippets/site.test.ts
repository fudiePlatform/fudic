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
  expect(t.getByRole('link', { name: 'Empezar con Fudic' })).toHaveAttribute('aria-current', 'page');
});

test('docsNav marks nothing on another page', async () => {
  const t = await renderSnippet('./site.fud', 'docsNav("elsewhere")');
  expect(t.getByRole('link', { name: 'Empezar con Fudic' })).not.toHaveAttribute('aria-current');
});

test('pager links the previous page on the left and the next one on the right, by their titles', async () => {
  const t = await renderSnippet('./site.fud', 'pager(prev: "/docs/a", prevTitle: "A", next: "/docs/b", nextTitle: "B")');
  const nav = t.getByRole('navigation', { name: 'Anterior y siguiente' });
  expect(nav).toBeInTheDocument();
  expect(t.getByRole('link', { name: 'Anterior A' })).toHaveAttribute('href', '/docs/a');
  expect(t.getByRole('link', { name: 'Siguiente B' })).toHaveAttribute('href', '/docs/b');
});

test('pager leaves out the side a page passes nothing for', async () => {
  const t = await renderSnippet('./site.fud', 'pager(next: "/docs/b", nextTitle: "B")');
  expect(t.query('.prev')).toBeNull();
  expect(t.getByRole('link', { name: 'Siguiente B' })).toHaveAttribute('rel', 'next');
});
