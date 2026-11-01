import { describe, expect, test } from 'vitest';
import { mount, visit } from '../../src/index.js';
import * as LPrecio from './src/components/l-precio.fud';

// An app with two locales (SDD-58 §4.6, SDD-71 §3.1): what a test imports, mounts and visits is
// compiled for the first, under its tag. With one locale nothing is tagged, and the other
// projects of this package are that case.
describe('an app with two locales', () => {
  test('a mounted component is the first locale\'s, and repaints in it', async () => {
    const t = await mount(LPrecio);
    expect(t.root.querySelector('output')!.textContent).toBe('2,00 €');
    t.root.querySelector('button')!.click();
    await t.settled();
    expect(t.root.querySelector('output')!.textContent).toBe('3,00 €');
  });

  test('a visited page hydrates its route and its components from that locale\'s modules', async () => {
    const page = await visit('/es/contador');
    expect(page.status).toBe(200);
    expect(page.document.documentElement.lang).toBe('es');
    await page.click(page.getByRole('button', { name: 'Sumar' }));
    expect(page.query('main > output')).toHaveTextContent('1');
  });
});
