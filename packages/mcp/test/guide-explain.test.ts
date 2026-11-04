/**
 * A code whose `.md` has no closing line: the catalogue allows it (no `**Fix:**`, no
 * `**Replaced by:**`), none is written that way today. The guide still answers it.
 */

import { describe, expect, it, vi } from 'vitest';
import { Guide } from '../src/guide.js';

vi.mock('@fudic/diagnostics/explain', () => ({
  explain: (code: string) => (code === 'FUD0001' ? { code, title: 'Bare', severity: 'error', why: 'Only why.' } : undefined),
}));

describe('a code with neither fix nor replacement', () => {
  it('closes with an empty replacement and carries neither field', () => {
    const result = new Guide().read('FUD0001');
    if (!('page' in result)) throw new Error('expected a page');
    expect(result.page.body).toBe('# FUD0001 — Bare\n**error**\n\nOnly why.\n\n**Replaced by:** \n');
    expect(result.page).not.toHaveProperty('fix');
    expect(result.page).not.toHaveProperty('replacedBy');
  });
});
