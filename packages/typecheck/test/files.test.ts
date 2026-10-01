/**
 * The only module that touches `node:fs` (SDD-24 §4.5, SDD-35 §4.2), driven over a real
 * workspace written to a temp folder.
 *
 * Its whole contract is that it does not throw: a folder that is not there is an empty
 * workspace, and a file that vanished between the watcher event and the read is `undefined`.
 * Both are ordinary states of a project being edited.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type * as ts from 'typescript';
import { describeFud, FudIndex, mountWorkspaceFuds, nodeFileSystem, toPosix } from '../src/index.js';
import { component, LAYOUT, route } from './_support.js';

const fs = nodeFileSystem();
let ROOT: string;

beforeAll(() => {
  ROOT = toPosix(mkdtempSync(join(tmpdir(), 'fudic-files-')));
  const files: Record<string, string> = {
    'blog/[slug].fud': route('../layouts/_layout.fud', ['../components/app-badge.fud']),
    'components/app-badge.fud': component('app-badge'),
    'components/site-nav.fud': component('site-nav'),
    'layouts/_layout.fud': LAYOUT,
    'components/notes.txt': 'not a component',
    // Never swept: none of these is a project's own file.
    'node_modules/pkg/hidden.fud': component('pkg-hidden'),
    'dist/out.fud': component('dist-out'),
    '.git/x.fud': component('git-x'),
  };
  for (const [relative, text] of Object.entries(files)) {
    const file = join(ROOT, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
});

describe('fudFiles', () => {
  it('sweeps the workspace for .fud, recursively, pruning node_modules, dist and .git', () => {
    expect([...fs.fudFiles(ROOT)].sort()).toEqual([
      `${ROOT}/blog/[slug].fud`,
      `${ROOT}/components/app-badge.fud`,
      `${ROOT}/components/site-nav.fud`,
      `${ROOT}/layouts/_layout.fud`,
    ]);
  });

  it('is an empty workspace when the folder is not there', () => {
    expect(fs.fudFiles(`${ROOT}/nowhere`)).toEqual([]);
  });
});

describe('readFile', () => {
  it('reads a file', () => {
    expect(fs.readFile(`${ROOT}/components/app-badge.fud`)).toContain('<app-badge>');
  });

  it('is undefined for what it cannot read', () => {
    expect(fs.readFile(`${ROOT}/components/ghost.fud`)).toBeUndefined();
  });
});

describe('realPath', () => {
  it('answers the file under one POSIX spelling', () => {
    const real = fs.realPath(`${ROOT}/components/app-badge.fud`);
    expect(real.toLowerCase()).toBe(`${ROOT}/components/app-badge.fud`.toLowerCase());
    expect(real).not.toMatch(/\\/);
  });

  it('answers a path that is not there with itself', () => {
    const ghost = `${ROOT}/components/ghost.fud`;
    expect(fs.realPath(ghost)).toBe(ghost);
  });

  it('resolves an href the way the build does', () => {
    expect(fs.resolveHref(`${ROOT}/blog/[slug].fud`, '../components/app-badge.fud')).toBe(
      `${ROOT}/components/app-badge.fud`,
    );
  });
});

describe('an index over the real workspace', () => {
  it('indexes the four .fud with their tags', () => {
    const index = new FudIndex(fs, describeFud);
    index.scan(ROOT);

    expect(index.all().map((entry) => entry.tag).filter((tag) => tag !== '').sort()).toEqual([
      'app-badge',
      'site-nav',
    ]);
    expect(index.resolve(`${ROOT}/blog/[slug].fud`, '../components/app-badge.fud')?.tag).toBe(
      'app-badge',
    );
  });
});

describe('mountWorkspaceFuds', () => {
  const hostWith = (names: string[]): ts.LanguageServiceHost =>
    ({ getScriptFileNames: () => names }) as unknown as ts.LanguageServiceHost;

  it('adds every listed .fud once, whatever slashes the host spells it with', () => {
    const names = ['C:\\p\\a.fud', '/p/x.ts'];
    const host = hostWith(names);
    const list = { all: () => [{ path: 'C:/p/a.fud' }, { path: '/p/b.fud' }] };

    expect(mountWorkspaceFuds(host, list)).toBe(2);
    expect(host.getScriptFileNames()).toEqual(['C:/p/a.fud', '/p/x.ts', '/p/b.fud']);
  });

  it('asks the list on every call: a file created later enters without a restart', () => {
    const entries = [{ path: '/p/a.fud' }];
    const host = hostWith([]);
    mountWorkspaceFuds(host, { all: () => entries });

    entries.push({ path: '/p/b.fud' });
    expect(host.getScriptFileNames()).toEqual(['/p/a.fud', '/p/b.fud']);
  });
});
