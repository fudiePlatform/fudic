/**
 * SDD-83 §3.7 — the manifest of what fudic emits by itself, and the floor it sets.
 *
 * Each entry copies its key's feature and `newly` date so that reading a `fudic.json` does not load
 * the table; this holds the copy to the table, so a version of web-features that moves a date fails
 * here and not in a user's project.
 */

import { describe, expect, it } from 'vitest';
import { EMITTED, FLOOR, needsNewer, status } from '../src/index.js';

describe('EMITTED', () => {
  it('every entry with a key carries the feature and the newly date the table has for it', () => {
    for (const entry of EMITTED) {
      if (entry.key === null) {
        expect(entry.feature).toBeNull();
        expect(entry.newly).toBeNull();
        expect(entry.remedy).not.toBeNull();
        continue;
      }
      const known = status(entry.key);
      expect(known, entry.key).toBeDefined();
      expect(entry.feature, entry.key).toBe(known!.feature);
      expect(entry.newly, entry.key).toBe(known!.newly);
    }
  });

  it('shadowrootdelegatesfocus has a remedy, so it asks nothing of a project', () => {
    const entry = EMITTED.find((e) => e.key === 'html.elements.template.shadowrootdelegatesfocus');
    expect(entry?.remedy).not.toBeNull();
  });
});

describe('FLOOR', () => {
  it('is exactly the newest newly date among the entries with no remedy (§4.7, step 4)', () => {
    const needed = EMITTED.filter((e) => e.remedy === null).map((e) => e.newly!);
    expect(FLOOR).toBe(needed.sort().at(-1));
    expect(FLOOR).toBe('2024-03-05');
  });

  it('needsNewer names, once each and in order, the features a cutoff lacks', () => {
    expect(needsNewer('2023-12-31')).toEqual(['declarative-shadow-dom', 'promise-withresolvers']);
    expect(needsNewer('2024-02-20')).toEqual(['promise-withresolvers']);
    expect(needsNewer(FLOOR)).toEqual([]);
    expect(needsNewer('2020-01-01')).toEqual([
      'declarative-shadow-dom',
      'promise-withresolvers',
      'form-associated-custom-elements',
      'constructed-stylesheets',
    ]);
  });
});
