import { expect, test } from 'vitest';
import { renderLayout } from '@fudic/testing';
import * as Docs from './docs.fud';

test('puts the page and its nav in the frame', async () => {
  const page = await renderLayout(Docs, {
    body: '<p>Hello</p>',
    sections: { nav: '<a href="/">Home</a>' },
  });
  expect(page.document.querySelector('p')).toHaveAttribute('slot', 'content');
  expect(page.document.querySelector('a')).toHaveAttribute('slot', 'nav');
});
