import { expect, test } from 'vitest';
import { renderSnippet } from '@fudic/testing';

test('row renders the label and the value', async () => {
  const t = await renderSnippet('./ui.fud', 'row("Plan", "Basic")');
  expect(t.query('dt')).toHaveTextContent('Plan');
  expect(t.query('dd')).toHaveTextContent('Basic');
});
