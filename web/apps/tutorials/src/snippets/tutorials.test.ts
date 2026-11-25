import { expect, test } from 'vitest';
import { renderSnippet } from '@fudic/testing';

test('links a written tutorial, with its level, and marks the current one', async () => {
  const t = await renderSnippet('./tutorials.fud', 'tutorial("first-app", "Tu primera app", "beginner", "first-app")');
  const link = t.query('a[href="/tutorials/first-app"]');
  expect(link).toHaveAttribute('aria-current', 'page');
  expect(link).toHaveTextContent('Principiante');
});

test('lists a tutorial still to write without a link', async () => {
  const t = await renderSnippet('./tutorials.fud', 'tutorial("editor", "El editor a tu favor", "advanced", "first-app", false)');
  expect(t.query('a')).not.toBeInTheDocument();
  expect(t.query('.soon')).toHaveTextContent('El editor a tu favor');
  expect(t.query('.soon .level')).toHaveTextContent('Avanzado');
});

test('the first steps menu leads back to the categories and lists its three tutorials', async () => {
  const t = await renderSnippet('./tutorials.fud', 'firstStepsNav("first-app")');
  expect(t.query('a[href="/tutorials/"]')).toBeInTheDocument();
  expect(t.query('.tutorial-list')?.querySelectorAll(':scope > li')).toHaveLength(3);
});
