import { describe, expect, test } from 'vitest';
import { renderLayout } from '../../src/index.js';
import * as Layout from './src/layouts/_layout.fud';

describe('criterion 24: a layout without a route', () => {
  test('paints the body, each section and the default of its prop', async () => {
    const page = await renderLayout(Layout, {
      body: '<p>the body</p>',
      sections: { nav: '<a href="/">Home</a>' },
    });
    expect(page.status).toBe(200);
    expect(page.document.documentElement.lang).toBe('es');
    expect(page.getByText('the body')).toBeInTheDocument();
    expect(page.query('main p')).toHaveTextContent('the body');
    expect(page.query('nav a')).toHaveAttribute('href', '/');
  });

  test('a prop given replaces its default, and the head lands in the head', async () => {
    const page = await renderLayout(Layout, {
      props: { culture: 'en' },
      head: '<title>Given</title>',
    });
    expect(page.document.documentElement.lang).toBe('en');
    expect(page.document.title).toBe('Given');
    expect(page.document.head.querySelector('meta[charset]')).not.toBeNull();
  });

  test('with nothing, the holes are empty', async () => {
    const page = await renderLayout(Layout);
    expect(page.query('main')).toBeEmptyDOMElement();
    expect(page.query('nav')).toBeEmptyDOMElement();
    expect(page.document.title).toBe('');
  });
});
