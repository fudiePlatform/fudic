import { expect, test } from 'vitest';
import { renderSnippet } from '@fudic/testing';

test('ficha with a tone: the snippet, and the badge it instantiates', async () => {
  const t = await renderSnippet('./ui.fud', 'ficha("Hola", tono: "info")');
  expect(t.getByRole('heading', { level: 3 })).toHaveTextContent('Hola');
  const badge = t.query('app-badge')!;
  expect(badge).toHaveTextContent('info');
  expect(badge.shadowRoot!.querySelector('.badge')).toHaveClass('info');
});

test('ficha without a tone takes its default', async () => {
  const t = await renderSnippet('./ui.fud', 'ficha("Adiós")');
  expect(t.query('app-badge')).toHaveTextContent('neutral');
  expect(t.query('.badge')).not.toHaveClass('info');
});

test('a value of the scope', async () => {
  const t = await renderSnippet('./ui.fud', 'nota(@texto)', { scope: { texto: 'del scope' } });
  expect(t.getByText('del scope')).toBeInTheDocument();
  expect(t.query('sin-css')).not.toBeNull();
});
