/**
 * The list the pairs of SDD-62 §4.2 check (criterion 5), and the fixtures held to it. The pairs
 * themselves run in `fixes-<n>.test.ts`; how the list and a pair are read is in `fixes/pairs.ts`.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureEntries, listed, SHARDS } from './fixes/pairs.js';

describe('the list of codes whose Fix is checked by a pair (criterion 5)', () => {
  it('is read from the catalogue and the passes, not written by hand', () => {
    // A code the compiler gives, with an example in its Fix: if it falls off, the rule broke.
    expect(listed).toContain('FUD0540');
    expect(listed.length).toBeGreaterThan(100);
  });

  it('leaves out a code the passes only name in a comment, and a Fix that is a command', () => {
    // FUD0742 and FUD0803 are the plugin's: the compiler mentions them and never calls them.
    expect(listed).not.toContain('FUD0742');
    expect(listed).not.toContain('FUD0803');
    // FUD0760's Fix is `pnpm add <pkg>`: no file of the language holds it.
    expect(listed).not.toContain('FUD0760');
  });

  it('every folder or file in fixtures/ belongs to a code of the list', () => {
    const stray = fixtureEntries().filter((name) => !listed.includes(/^FUD\d{4}/u.exec(name)?.[0] ?? ''));
    expect(stray).toEqual([]);
  });

  it('every shard has its file', () => {
    const here = readdirSync(fileURLToPath(new URL('.', import.meta.url)));
    expect(Array.from({ length: SHARDS }, (_, n) => here.includes(`fixes-${n}.test.ts`))).toEqual(
      Array.from({ length: SHARDS }, () => true),
    );
  });
});
