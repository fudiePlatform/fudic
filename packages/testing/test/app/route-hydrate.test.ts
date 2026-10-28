import { describe, expect, test } from 'vitest';
import { visit } from '../../src/index.js';

// A route with a client half of its own publishes its name in `fud-route`, and `visit` hands the
// runtime that route's `?client` under it: the page's own handlers work, not only its components'.
describe('a route that hydrates', () => {
  test('its own handler runs and its own signal repaints', async () => {
    const page = await visit('/contador');
    expect(page.document.getElementById('fud-route')).not.toBeNull();
    expect(page.query('output')).toHaveTextContent('0');
    await page.click(page.getByRole('button', { name: '+1' }));
    expect(page.query('output')).toHaveTextContent('1');
  });

  test('a route with no client half publishes no name, and still paints', async () => {
    const page = await visit('/blog/x');
    expect(page.document.getElementById('fud-route')).toBeNull();
    expect(page.status).toBe(200);
  });
});
