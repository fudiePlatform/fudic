import { describe, expect, test } from 'vitest';
import { renderSnippet } from '../../src/index.js';

describe('criterion 25: a snippet, positional and named arguments', () => {
  test('paints the snippet, and the component it instantiates comes with it', async () => {
    const t = await renderSnippet('./src/snippets/ui.fud', 'ficha("Hola", tono: "info")');
    expect(t.getByRole('heading', { level: 3 })).toHaveTextContent('Hola');
    const badge = t.query('x-badge')!;
    expect(badge.shadowRoot).not.toBeNull();
    expect(t.query('.badge')).toHaveClass('info');
    // Defined: a click on it wakes it up, and the click counts.
    await t.click(t.getByRole('button', { name: 'Tap' }));
    expect(t.getByRole('status')).toHaveTextContent('1');
    expect(customElements.get('x-badge')).toBeDefined();
  });

  test('a named argument left out takes its default', async () => {
    const t = await renderSnippet('./src/snippets/ui.fud', 'ficha("Adiós")');
    expect(t.getByRole('heading', { level: 3 })).toHaveTextContent('Adiós');
    expect(t.query('.badge')).not.toHaveClass('info');
    expect(t.query('x-badge')).toHaveTextContent('neutral');
  });
});

describe('criterion 26: scope', () => {
  test('carries an object to the snippet', async () => {
    const t = await renderSnippet('./src/snippets/ui.fud', 'fila(@item)', { scope: { item: { id: 1, name: 'A' } } });
    expect(t.query('p[data-id="1"]')).toHaveTextContent('A');
  });

  test('carries several values, of any JSON shape', async () => {
    const t = await renderSnippet('./src/snippets/ui.fud', 'ficha(@titulo, tono: @tono)', {
      scope: { titulo: 'Del scope', tono: 'info' },
    });
    expect(t.getByRole('heading', { level: 3 })).toHaveTextContent('Del scope');
    expect(t.query('.badge')).toHaveClass('info');
  });
});
