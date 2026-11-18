import { expect, test } from 'vitest';
import { renderLayout } from '@fudic/testing';
import * as Docs from './docs.fud';

test('renders the page inside it', async () => {
  const page = await renderLayout(Docs, { body: '<p>Hello</p>' });
  expect(page.document.querySelector('main')?.textContent).toContain('Hello');
});
