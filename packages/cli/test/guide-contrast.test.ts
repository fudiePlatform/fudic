/**
 * SDD-79 §4.10, criterion 32 — the colours of the generated guide meet WCAG 2.2 AA, in light and
 * in dark. Read from `templates/guide/tokens.css` as it ships: each `light-dark(a, b)` gives its
 * two values, and every pair of the table is measured in both modes.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TOKENS = readFileSync(fileURLToPath(new URL('../templates/guide/tokens.css', import.meta.url)), 'utf8');

type Mode = 'light' | 'dark';

/** `--<project>-<name>: light-dark(#light, #dark)` of `css`, by name and mode. */
function colours(css: string): ReadonlyMap<string, Readonly<Record<Mode, string>>> {
  const out = new Map<string, Record<Mode, string>>();
  for (const m of css.matchAll(/--\{\{project\}\}-([a-z-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/giu)) {
    out.set(m[1]!, { light: m[2]!, dark: m[3]! });
  }
  return out;
}

/** WCAG 2.2 relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The table of §4.10: what is read, on what, and the least it needs. */
const PAIRS: readonly (readonly [readonly string[], readonly string[], number])[] = [
  [['ink', 'muted', 'accent', 'danger'], ['surface', 'raised'], 4.5],
  [['on-accent'], ['accent'], 4.5],
  [['on-danger'], ['danger'], 4.5],
  [['line', 'focus'], ['surface', 'raised'], 3],
];

/** Every pair that falls short in either mode, as `fg/bg mode ratio`. */
function shortfalls(css: string): string[] {
  const c = colours(css);
  const out: string[] = [];
  for (const [fgs, bgs, min] of PAIRS) {
    for (const fg of fgs) {
      for (const bg of bgs) {
        for (const mode of ['light', 'dark'] as const) {
          const r = ratio(c.get(fg)![mode], c.get(bg)![mode]);
          if (r < min) out.push(`${fg}/${bg} ${mode} ${r.toFixed(2)}`);
        }
      }
    }
  }
  return out;
}

describe('the guide\'s colours (criterion 32)', () => {
  it('every colour of the table is a light-dark() pair', () => {
    const c = colours(TOKENS);
    for (const name of ['ink', 'muted', 'surface', 'raised', 'line', 'accent', 'on-accent', 'danger', 'on-danger', 'focus']) {
      expect(c.has(name), name).toBe(true);
    }
  });

  it('meets AA in light and in dark', () => {
    expect(shortfalls(TOKENS)).toEqual([]);
  });

  it('an ink of #999 breaks it', () => {
    const grey = TOKENS.replace(/(--\{\{project\}\}-ink:\s*light-dark\()#[0-9a-f]{6}/iu, '$1#999999');
    expect(shortfalls(grey)).toEqual(expect.arrayContaining([expect.stringMatching(/^ink\/surface light /u)]));
  });

  it('measures as WCAG does: black on white is 21, a colour on itself is 1', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(ratio('#2457d6', '#2457d6')).toBe(1);
  });
});
