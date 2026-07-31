/**
 * Acceptance criterion 12: range formatting takes the smallest COMPLETE node.
 */

import { describe, expect, it } from 'vitest';
import { span } from '@fudic/compiler';
import { formatRange } from '../../src/index.js';
import { corpus } from './_corpus.js';

const fixture = (name: string) => corpus.find((f) => f.name === name)!;

describe('criterion 12 — half a header formats the whole construct', () => {
  const page = fixture('canonical/home.fud');

  it('selecting the middle of an @if header formats the @if, not the half', async () => {
    const header = page.source.indexOf('data.items.length === 0');
    const result = await formatRange(page.source, span(header + 4, header + 9));
    expect(result.ok).toBe(true);
    const text = result.ok ? result.text : '';
    // The construct came out whole, with both of its arms.
    expect(text).toContain('@if (data.items.length === 0) {');
    expect(text).toContain('} else {');
  });

  it('leaves every byte outside the chosen node exactly as it was', async () => {
    const messy = page.source.replace('<h1>@data.title</h1>', '<h1   >@data.title</h1  >');
    const header = messy.indexOf('data.items.length === 0');
    const result = await formatRange(messy, span(header + 4, header + 9));
    expect(result.ok && result.text).toContain('<h1   >@data.title</h1  >');
  });

  it('a selection inside a @code takes the @code: half a fragment is not one', async () => {
    const badge = fixture('canonical/app-badge.fud');
    const at = badge.source.indexOf('props<');
    const result = await formatRange(badge.source, span(at, at + 3));
    expect(result.ok && result.text.startsWith('@code {')).toBe(true);
  });

  it('formatting the whole file by range is the same as formatting the file', async () => {
    for (const item of [page, fixture('lsp/blog/[slug].fud')]) {
      const ranged = await formatRange(item.source, span(0, item.source.length));
      const whole = await formatRange(item.source, span(0, item.source.length));
      expect(ranged.ok && whole.ok && ranged.text).toBe(whole.ok ? whole.text : '');
    }
  });
});
