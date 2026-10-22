/** SDD-60 §4.9 (Invalidación) — the types this server writes, as the project's TypeScript reads them. */

import { describe, expect, it } from 'vitest';
import { mountApiTypes, type ApiTypesHost } from '../../src/fudapi/types-mount.js';

const OLD = '/p/.fudic/api/old.d.ts';
const NEW = '/p/.fudic/api/new.d.ts';
const GONE = '/p/.fudic/api/gone.d.ts';
const OTHER = '/p/src/x.ts';
/** `OLD`, as a Windows host spells it. */
const WINDOWS_OLD = OLD.replace(/\//g, '\\');

/** What the server wrote: `NEW` and `OLD` with text, `GONE` removed. */
function apis(revision = 3) {
  const types = new Map<string, string | undefined>([
    [OLD, 'old text'],
    [NEW, 'new text'],
    [GONE, undefined],
  ]);
  return {
    written: (path: string) => (types.has(path) ? types.get(path) : null),
    writtenPaths: () => [...types.keys()],
    revision,
  };
}

/** Volar's host, as it cached the disk: it lists `OLD` (with a backslash), `GONE` and `OTHER`. */
function host(withVersion: boolean): ApiTypesHost {
  return {
    getScriptFileNames: () => [WINDOWS_OLD, GONE, OTHER],
    getScriptSnapshot: (name) => (name === OTHER ? { getText: () => 'disk', getLength: () => 4, getChangeRange: () => undefined } : undefined),
    getScriptVersion: () => 'disk',
    fileExists: (name) => name === OTHER,
    readFile: (name) => (name === OTHER ? 'disk' : undefined),
    ...(withVersion ? { getProjectVersion: () => '7' } : {}),
  };
}

describe('mountApiTypes', () => {
  it('lists what was written, drops what was removed, keeps the rest', () => {
    const h = host(true);
    mountApiTypes(h, apis());
    expect(h.getScriptFileNames()).toEqual([WINDOWS_OLD, OTHER, NEW]);
  });

  it('answers the written text and its revision, and the disk for the rest', () => {
    const h = host(true);
    mountApiTypes(h, apis());
    expect(h.getScriptSnapshot(NEW)!.getText(0, 3)).toBe('new');
    expect(h.getScriptSnapshot(GONE)).toBeUndefined();
    expect(h.getScriptSnapshot(OTHER)!.getText(0, 4)).toBe('disk');
    expect(h.getScriptVersion(NEW)).toBe('fudapi:3');
    expect(h.getScriptVersion(OTHER)).toBe('disk');
    expect(h.fileExists(NEW)).toBe(true);
    expect(h.fileExists(GONE)).toBe(false);
    expect(h.fileExists(OTHER)).toBe(true);
    expect(h.readFile(NEW)).toBe('new text');
    expect(h.readFile(GONE)).toBeUndefined();
    expect(h.readFile(OTHER)).toBe('disk');
  });

  it('a write changes the version of the project, with or without one of its own', () => {
    const versioned = host(true);
    mountApiTypes(versioned, apis(4));
    expect(versioned.getProjectVersion!()).toBe('7:fudapi:4');
    const bare = host(false);
    mountApiTypes(bare, apis(4));
    expect(bare.getProjectVersion!()).toBe(':fudapi:4');
  });
});
