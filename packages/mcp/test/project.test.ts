/** The folder the server was started in: its name and its commit. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFudicProject, isWorkspace, NO_COMMIT, openProject, projectOf, projectsOf, type Git } from '../src/project.js';
import { tempDir } from './helpers.js';

function named(files: Readonly<Record<string, string>>): string {
  const dir = tempDir(files);
  try {
    const project = openProject(dir.root, () => 'x');
    expect(project.root).toBe(dir.root);
    return project.name === basename(dir.root) ? '<folder>' : project.name;
  } finally {
    dir.dispose();
  }
}

describe('openProject', () => {
  it('is named by its package.json', () => {
    expect(named({ 'package.json': '{ "name": "acme" }' })).toBe('acme');
  });

  it.each([
    ['without package.json', {}],
    ['with a package.json that does not parse', { 'package.json': '{' }],
    ['with a name that is not a string', { 'package.json': '{ "name": 7 }' }],
    ['with an empty name', { 'package.json': '{ "name": "" }' }],
  ])('is named by its folder %s', (_why, files) => {
    expect(named(files)).toBe('<folder>');
  });

  it('reads the commit on every call, in its own folder', () => {
    const calls: [string, readonly string[]][] = [];
    let head = 'b59fa7d';
    const git: Git = (root, args) => {
      calls.push([root, args]);
      return head;
    };
    const project = openProject('/p', git);
    expect(project.commit()).toBe('b59fa7d');
    head = 'c0ffee1';
    expect(project.commit()).toBe('c0ffee1');
    expect(calls).toEqual([
      // The root is resolved: `/p` is `C:\p` on Windows.
      [resolve('/p'), ['rev-parse', '--short', 'HEAD']],
      [resolve('/p'), ['rev-parse', '--short', 'HEAD']],
    ]);
  });

  it('has no commit when git fails: none', () => {
    const project = openProject('/p', () => {
      throw new Error('not a git repository');
    });
    expect(project.commit()).toBe(NO_COMMIT);
    expect(NO_COMMIT).toBe('none');
  });
});

describe('a workspace: its projects (SDD-77 §8.2.50)', () => {
  it('each <group>/<name> with a fudic.json, in path order; anything else is one project, the folder itself', () => {
    const dir = tempDir();
    try {
      for (const folder of ['libs/ui', 'apps/web', 'apps/notes', 'node_modules/x']) mkdirSync(join(dir.root, folder), { recursive: true });
      for (const folder of ['libs/ui', 'apps/web', 'node_modules/x']) writeFileSync(join(dir.root, folder, 'fudic.json'), '{}');
      writeFileSync(join(dir.root, 'README.md'), '');
      // Without pnpm-workspace.yaml it is no workspace: the folder is all there is.
      expect(isWorkspace(dir.root)).toBe(false);
      expect(projectsOf(dir.root)).toEqual([dir.root]);
      writeFileSync(join(dir.root, 'pnpm-workspace.yaml'), '');
      expect(isWorkspace(dir.root)).toBe(true);
      expect(isFudicProject(dir.root)).toBe(true);
      const projects = projectsOf(dir.root);
      expect(projects).toEqual([join(dir.root, 'apps/web'), join(dir.root, 'libs/ui')]);
      expect(projectOf(projects, dir.root, join(dir.root, 'libs/ui/src/a.fud'))).toBe(join(dir.root, 'libs/ui'));
      expect(projectOf(projects, dir.root, join(dir.root, 'src/a.fud'))).toBe(dir.root);
      // A root with a fudic.json of its own is that project, whatever it holds.
      writeFileSync(join(dir.root, 'fudic.json'), '{}');
      expect(isWorkspace(dir.root)).toBe(false);
      expect(projectsOf(dir.root)).toEqual([dir.root]);
    } finally {
      dir.dispose();
    }
  });

  it('the deepest project that holds a file', () => {
    expect(projectOf(['/w', '/w/apps/web'], '/w', '/w/apps/web/src/a.fud')).toBe('/w/apps/web');
  });
});
