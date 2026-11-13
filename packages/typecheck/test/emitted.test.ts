/**
 * SDD-83 §4.7, criterion 28 — the manifest of what fudic emits, held to the code of its runtime.
 *
 * The TS detector reads the browser code of `@fudic/core`, `dom`, `forms`, `http` (its client),
 * `transport` and `i18n`. Every key newer than `widely` has to be in `EMITTED`; one without a remedy
 * cannot be newer than `FLOOR`; and `FLOOR` is exactly the newest of those. Something the runtime
 * starts using above the floor without saying so fails here. The HTML half — what a built page
 * carries — is read by `examples/basic`, which is the one that can serve its pages.
 *
 * TypeScript 6 checks it: its `lib.dom` declares what 5.9's does not yet (`URLPattern`).
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type ts from 'typescript';
import ts6 from 'typescript-6';
import { cutoff, EMITTED, FLOOR, status } from '@fudic/baseline';
import { moduleBaselineUses } from '../src/index.js';

const PACKAGES = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/gu, '/');

/** The folders of browser code: the client of `http`, every other runtime whole. */
const BROWSER = ['core/src', 'dom/src', 'forms/src', 'http/src/client', 'transport/src', 'i18n/src'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/u.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

/** The keys a list of uses reads, newer than `widely`, that the manifest does not list. */
export function unlisted(keys: Iterable<string>): readonly string[] {
  const widely = cutoff('widely');
  const listed = new Set(EMITTED.map((entry) => entry.key));
  return [...new Set(keys)].filter((key) => {
    const newly = status(key)?.newly;
    return newly !== undefined && (newly === null || newly > widely) && !listed.has(key);
  });
}

const files = BROWSER.flatMap((dir) => sources(join(PACKAGES, dir).replace(/\\/gu, '/')));
const program = (ts6 as unknown as typeof ts).createProgram({
  rootNames: files,
  options: {
    target: ts6.ScriptTarget.ES2022 as unknown as ts.ScriptTarget,
    module: ts6.ModuleKind.ESNext as unknown as ts.ModuleKind,
    moduleResolution: ts6.ModuleResolutionKind.Bundler as unknown as ts.ModuleResolutionKind,
    lib: ['lib.es2024.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
});
const keys = files.flatMap((file) => moduleBaselineUses(program, file).map((use) => use.key));

describe('the manifest and the runtime (criterion 28)', () => {
  it('reads the runtime: a good many keys of the browser', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(keys.length).toBeGreaterThan(100);
  });

  it('every key of the runtime newer than widely is in EMITTED', () => {
    expect(unlisted(keys)).toEqual([]);
  });

  it('a URLPattern the runtime started to call without an entry fails', () => {
    expect(unlisted([...keys, 'api.URLPattern.URLPattern'])).toEqual(['api.URLPattern.URLPattern']);
  });

  it('an entry without a remedy is not newer than FLOOR, and FLOOR is the newest of them', () => {
    const needed = EMITTED.filter((entry) => entry.remedy === null && entry.newly !== null).map((entry) => entry.newly!);
    expect(needed.every((date) => date <= FLOOR)).toBe(true);
    expect(needed).toContain(FLOOR);
  });
});
