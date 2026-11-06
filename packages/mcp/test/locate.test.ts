/** The folder as the frontier (SDD-77 §4.2, FUD1400): what a path a tool was given may reach. */

import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locate } from '../src/locate.js';
import { tempDir } from './helpers.js';

let project: ReturnType<typeof tempDir>;
let outside: ReturnType<typeof tempDir>;

beforeEach(() => {
  project = tempDir();
  outside = tempDir({ 'secret.txt': 'x' });
  mkdirSync(join(project.root, 'src'));
  writeFileSync(join(project.root, 'src', 'a.fud'), '');
});

afterEach(() => {
  project.dispose();
  outside.dispose();
});

const refused = (path: string): void => {
  const result = locate(project.root, path);
  expect(result, path).toEqual({ error: expect.objectContaining({ code: 'FUD1400', file: path }) });
};

describe('locate', () => {
  it('a file inside, an absolute path inside, a file not written yet, the project itself', () => {
    expect(locate(project.root, 'src/a.fud')).toEqual({ path: join(project.root, 'src', 'a.fud') });
    expect(locate(project.root, join(project.root, 'src', 'a.fud'))).toEqual({ path: join(project.root, 'src', 'a.fud') });
    expect(locate(project.root, 'src/new/b.fud')).toEqual({ path: join(project.root, 'src', 'new', 'b.fud') });
    expect(locate(project.root, '.')).toEqual({ path: resolve(project.root) });
    expect(locate(project.root, 'src/../src/a.fud')).toEqual({ path: join(project.root, 'src', 'a.fud') });
  });

  it('a name that only starts with two dots is inside', () => {
    expect(locate(project.root, '..notes/x.md')).toEqual({ path: join(project.root, '..notes', 'x.md') });
  });

  it.each([['../x'], ['src/../../x'], ['..']])('%s leaves the project: FUD1400', (path) => {
    refused(path);
  });

  it('an absolute path elsewhere: FUD1400', () => {
    refused(join(outside.root, 'secret.txt'));
  });

  it.each([['.git/config'], ['node_modules/a/index.js'], ['.fudic/api/r.d.ts'], ['src/node_modules/x'], ['libs/ui/.git/HEAD']])(
    '%s is in a closed folder: FUD1400',
    (path) => {
      refused(path);
    },
  );

  it('a link that leads out is outside, whatever its name says', () => {
    symlinkSync(outside.root, join(project.root, 'out'), 'junction');
    refused('out/secret.txt');
    refused('out');
  });

  it('a link that stays inside is inside', () => {
    symlinkSync(join(project.root, 'src'), join(project.root, 'alias'), 'junction');
    expect(locate(project.root, 'alias/a.fud')).toEqual({ path: join(project.root, 'alias', 'a.fud') });
  });
});
