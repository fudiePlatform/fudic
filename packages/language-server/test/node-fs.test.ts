/**
 * The only module that touches `node:fs` (SDD-24 §4.5), driven over the real fixture
 * workspace.
 *
 * Its whole contract is that it does not throw: a folder that is not there is an empty
 * workspace, and a file that vanished between the watcher event and the read is `undefined`.
 * Both are ordinary states of a project being edited.
 */

import { describe, expect, it } from 'vitest';
import { nodeFileSystem } from '../src/node-fs.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { FIXTURES } from './_support.js';

const fs = nodeFileSystem();

describe('fudFiles', () => {
  it('sweeps the workspace for .fud, recursively', () => {
    expect([...fs.fudFiles(FIXTURES)].sort()).toEqual([
      `${FIXTURES}/blog/[slug].fud`,
      `${FIXTURES}/components/app-badge.fud`,
      `${FIXTURES}/components/site-nav.fud`,
      `${FIXTURES}/layouts/_layout.fud`,
    ]);
  });

  it('is an empty workspace when the folder is not there', () => {
    expect(fs.fudFiles(`${FIXTURES}/nowhere`)).toEqual([]);
  });

  it('never walks into node_modules or dist', () => {
    // The sweep of the package itself: its node_modules holds .fud files of no project.
    const root = FIXTURES.slice(0, FIXTURES.lastIndexOf('/'));

    for (const file of fs.fudFiles(root)) {
      expect(file).not.toContain('/node_modules/');
      expect(file).not.toContain('/dist/');
    }
  });
});

describe('readFile', () => {
  it('reads a file', () => {
    expect(fs.readFile(`${FIXTURES}/components/app-badge.fud`)).toContain('<app-badge>');
  });

  it('is undefined for what it cannot read', () => {
    expect(fs.readFile(`${FIXTURES}/components/ghost.fud`)).toBeUndefined();
  });
});

describe('the real workspace of §6', () => {
  it('indexes the four .fud of the corpus with their roles', () => {
    const index = new WorkspaceIndex(fs);
    index.scan(FIXTURES);

    expect(index.byRole('component').map((entry) => entry.tag).sort()).toEqual([
      'app-badge',
      'site-nav',
    ]);
    expect(index.byRole('layout').length).toBe(1);
    expect(index.byRole('route').length).toBe(1);
    expect(index.resolve(`${FIXTURES}/blog/[slug].fud`, '../components/app-badge.fud')?.tag).toBe(
      'app-badge',
    );
  });
});
