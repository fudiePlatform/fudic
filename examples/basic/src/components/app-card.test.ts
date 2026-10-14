import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import fixtures from './app-card.fixture';
import * as AppCard from './app-card.fud';

// A component with no JavaScript (N1): the server's HTML and nothing else.

test('the featured card, from the fixture of its .fudspec', async () => {
  const t = await mount(AppCard, { props: fixtures.destacada });
  expect(t.root).toBe(t.host.shadowRoot);
  expect(t.getByRole('link', { name: 'Featured' })).toHaveAttribute('href', '/blog/featured');
  expect(t.query('article')).toHaveClass('card', 'highlight');
});

test('without a variant, the default one', async () => {
  const t = await mount(AppCard, { props: fixtures.minima });
  expect(t.getByRole('heading', { level: 2 })).toHaveTextContent('A');
  expect(t.query('article')).not.toHaveClass('highlight');
});
