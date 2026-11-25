import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers / with the headline and the two ways in', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
  expect(page.document.querySelector('h1')?.textContent).toContain('Lo que aprendes con Fudic es la web');
  expect(page.document.querySelector('a.start')?.getAttribute('href')).toBe('/docs/getting-started');
  expect(page.document.querySelector('ui-command')).not.toBeNull();
});

test('each proof under the headline links to the block that proves it', async () => {
  const page = await visit('/');
  const targets = [...page.document.querySelectorAll('.proofs a')].map((a) => a.getAttribute('href'));
  expect(targets).toEqual(['#standard', '#llm', '#performance', '#security', '#polyglot']);
  for (const target of targets) {
    expect(page.document.querySelector(String(target))?.tagName).toBe('H2');
  }
});

test('the blocks come in the order of the proofs: standard, the LLM, performance, security', async () => {
  const page = await visit('/');
  const ids = [...page.document.querySelectorAll('.block h2')].map((h) => h.id);
  expect(ids).toEqual(['standard', 'llm', 'performance', 'security']);
});
