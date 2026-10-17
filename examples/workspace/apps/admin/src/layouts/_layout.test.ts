import { expect, test } from 'vitest';
import { renderLayout } from '@fudic/testing';
import * as Layout from './_layout.fud';

test('renders the page inside it', async () => {
  const page = await renderLayout(Layout, { body: '<p>Hello</p>' });
  expect(page.document.querySelector('main')?.textContent).toContain('Hello');
});
