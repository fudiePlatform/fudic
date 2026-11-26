import { expect, test } from 'vitest';
import { renderSnippet } from '@fudic/testing';

test('a card with a written tutorial links its title to it, under its picture', async () => {
  const t = await renderSnippet('./home.fud', 'category("first-steps", "Primeros pasos", "Crea una app.", 3, true, false, false, "/tutorials/first-app")');
  expect(t.query('h2 a')).toHaveAttribute('href', '/tutorials/first-app');
  expect(t.query('.art svg')).toHaveAttribute('aria-hidden', 'true');
  expect(t.query('.count')).toHaveTextContent('3 tutoriales');
  expect(t.query('.levels')?.querySelectorAll(':scope > li')).toHaveLength(1);
  expect(t.query('.soon')).not.toBeInTheDocument();
});

test('a card with no tutorial yet has no link and says it is on its way', async () => {
  const t = await renderSnippet('./home.fud', 'category("agents", "Agentes", "Con tu agente.", 1, false, true, true)');
  expect(t.query('a')).not.toBeInTheDocument();
  expect(t.query('.count')).toHaveTextContent('1 tutorial');
  expect(t.query('.levels')?.querySelectorAll(':scope > li')).toHaveLength(2);
  expect(t.query('.soon')).toHaveTextContent('En preparación');
});

test('every category has its own picture', async () => {
  const names = ['first-steps', 'template-syntax', 'events', 'reactivity', 'styles', 'routes', 'forms', 'server',
    'dependency-injection', 'i18n', 'service-worker', 'security', 'performance', 'tests', 'project', 'agents'];
  const pictures = new Set<string>();
  for (const name of names) {
    const t = await renderSnippet('./home.fud', `categoryArt("${name}")`);
    const svg = t.query('.art svg');
    expect(svg, name).toBeInTheDocument();
    pictures.add(svg?.innerHTML ?? '');
  }
  expect(pictures.size).toBe(names.length);
}, 60_000);

test('a template picture shows the @ of the syntax', async () => {
  const t = await renderSnippet('./home.fud', 'categoryArt("template-syntax")');
  expect(t.query('.art svg')).toHaveTextContent('@foreach (t of tasks) {');
});
