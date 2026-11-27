/**
 * SDD-83 §1.2, decision 4: what fudic writes says nothing to its user. The guide every new project
 * depends on (`@fudic/guide`, and the copy `fudic g guide` makes of it) becomes the author's, and a
 * project born with a `FUD1524` in it learns to ignore the warning.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssBaselineUses, judgeUses } from '@fudic/compiler';

const TEMPLATES = fileURLToPath(new URL('../templates/', import.meta.url));
const GUIDE = `${dirname(createRequire(import.meta.url).resolve('@fudic/guide/fudic.json'))}/`;

describe('the sheets fudic writes for a new project — its guide among them —, against widely', () => {
  it('warns about nothing', () => {
    const widely = { target: 'widely' as const, allow: new Set<string>() };
    const sheets = [TEMPLATES, GUIDE].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.css')).map((name) => `${dir}${name}`),
    );
    expect(sheets.length).toBeGreaterThan(40);
    const found = sheets.flatMap((name) => {
      const css = readFileSync(name, 'utf8');
      return judgeUses(cssBaselineUses(css), widely).map((d) => `${name}: ${d.message}`);
    });
    expect(found).toEqual([]);
  });
});
