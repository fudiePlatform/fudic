import { expect, test } from 'vitest';
import { renderLayout } from '@fudic/testing';
import * as Home from './home.fud';

test('renders the page inside it', async () => {
  const page = await renderLayout(Home, { body: '<p>Hello</p>' });
  expect(page.document.querySelector('main')?.textContent).toContain('Hello');
});
