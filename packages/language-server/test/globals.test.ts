/**
 * The ambient declarations mounted in memory (SDD-24 §2).
 *
 * The one thing that must not happen is mounting them twice: the on-disk file the CLI writes
 * declares the very same names, and a program with two of everything is TS2300 on every line.
 */

import { describe, expect, it } from 'vitest';
import type * as ts from 'typescript';
import { GLOBALS_DTS, GLOBALS_FILE_NAME, mountGlobals } from '../src/globals.js';

/** A language service host with `files` in it, and nothing else. */
function fakeHost(files: readonly string[]): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => [...files],
    getScriptVersion: () => '7',
    getScriptSnapshot: () => undefined,
    getCompilationSettings: () => ({}),
    getCurrentDirectory: () => '/p',
    getDefaultLibFileName: () => 'lib.d.ts',
    fileExists: (name: string) => files.includes(name),
    readFile: (name: string) => (files.includes(name) ? 'on disk' : undefined),
  };
}

describe('mountGlobals', () => {
  it('adds the file to the program', () => {
    const host = fakeHost(['/p/blog/[slug].fud.ts']);

    expect(mountGlobals(host, '/p')).toBe(true);
    expect(host.getScriptFileNames()).toEqual(['/p/blog/[slug].fud.ts', `/p/${GLOBALS_FILE_NAME}`]);
  });

  it('serves its text, its version and its existence', () => {
    const host = fakeHost([]);
    mountGlobals(host, '/p');
    const name = `/p/${GLOBALS_FILE_NAME}`;

    expect(host.getScriptSnapshot(name)?.getText(0, GLOBALS_DTS.length)).toBe(GLOBALS_DTS);
    expect(host.getScriptVersion(name)).toBe('1');
    expect(host.fileExists(name)).toBe(true);
    expect(host.readFile(name)).toBe(GLOBALS_DTS);
  });

  it('still answers for every other file', () => {
    const host = fakeHost(['/p/other.ts']);
    mountGlobals(host, '/p');

    expect(host.getScriptVersion('/p/other.ts')).toBe('7');
    expect(host.getScriptSnapshot('/p/other.ts')).toBeUndefined();
    expect(host.fileExists('/p/other.ts')).toBe(true);
    expect(host.fileExists('/p/nope.ts')).toBe(false);
    expect(host.readFile('/p/other.ts')).toBe('on disk');
  });

  it('does not mount when the project ships the file, whatever the separators', () => {
    expect(mountGlobals(fakeHost([`/p/${GLOBALS_FILE_NAME}`]), '/p')).toBe(false);
    expect(mountGlobals(fakeHost([`C:\\p\\${GLOBALS_FILE_NAME}`]), 'C:/p')).toBe(false);
  });

});
