import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers / with the headline and the two ways in', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
  expect(page.document.querySelector('h1')?.textContent).toContain('El framework que tu IA entiende');
  expect(page.document.querySelector('a.start')?.getAttribute('href')).toBe('/docs/getting-started');
  expect(page.document.querySelector('ui-command')).not.toBeNull();
});
