import { expect, test } from 'vitest';
import { visit } from '../../src/index.js';

// SDD-70 §4.4: a page with `@await` goes out in parts, and `visit` reads it as the coordinator
// does — the route comes up from the blocks of its parts, and none of them is left behind.
test('a route in parts hydrates from its parts, and leaves no block in the document', async () => {
  const page = await visit('/espera');
  expect(page.status).toBe(200);
  expect(document.querySelector('p.total')).toHaveTextContent('3');
  expect(document.querySelector('script[data-fud-part]')).toBeNull();
  await page.click(document.querySelector('button')!);
  expect(document.querySelector('output')).toHaveTextContent('1');
});
