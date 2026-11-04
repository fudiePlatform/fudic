/** The folder the server was started in: its name and its commit. */

import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_COMMIT, openProject, type Git } from '../src/project.js';
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
      ['/p', ['rev-parse', '--short', 'HEAD']],
      ['/p', ['rev-parse', '--short', 'HEAD']],
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
