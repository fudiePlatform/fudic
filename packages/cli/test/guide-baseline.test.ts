/**
 * SDD-83 §1.2, decision 4: what fudic writes says nothing to its user. The guide `fudic new` writes
 * becomes the author's, and a project born with a `FUD1524` in it learns to ignore the warning.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssBaselineUses, judgeUses } from '@fudic/compiler';

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));

describe('the sheets fudic writes for a new project — its guide among them —, against widely', () => {
  it('warns about nothing', () => {
    const widely = { target: 'widely' as const, allow: new Set<string>() };
    const sheets = readdirSync(TEMPLATES, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.css'));
    expect(sheets.length).toBeGreaterThan(40);
    const found = sheets.flatMap((name) => {
      const css = readFileSync(`${TEMPLATES}${name}`, 'utf8');
      return judgeUses(cssBaselineUses(css), widely).map((d) => `${name}: ${d.message}`);
    });
    expect(found).toEqual([]);
  });
});
