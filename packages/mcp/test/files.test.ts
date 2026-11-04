/**
 * `fudic_files`, `fudic_read` and `fudic_write` on their own (SDD-77 §4.2, §8.2.21, criteria 9–11):
 * the folder as a chat sees it, with git or without it, and every write all or nothing.
 */

import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesUnder, listFiles, readLines, READ_LIMIT, writeFile } from '../src/files.js';
import type { Git } from '../src/project.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir>;

function write(files: Readonly<Record<string, string | Buffer>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir.root, path)), { recursive: true });
    writeFileSync(join(dir.root, path), text);
  }
}

const noGit: Git = () => {
  throw new Error('not a git repository');
};

beforeEach(() => {
  dir = tempDir();
});

afterEach(() => {
  dir.dispose();
});

describe('listFiles', () => {
  it('without git: every file, sorted, but node_modules, dist, .git and .fudic', () => {
    write({
      'src/b.fud': '',
      'a.json': '',
      'src/deep/c.ts': '',
      'node_modules/x/i.js': '',
      'dist/o.js': '',
      '.git/HEAD': '',
      '.fudic/api/r.d.ts': '',
      'src/dist/z.js': '',
    });
    symlinkSync(join(dir.root, 'src'), join(dir.root, 'linked'), 'junction');
    expect(listFiles(dir.root, noGit)).toEqual(['a.json', 'src/b.fud', 'src/deep/c.ts']);
  });

  it('with git: what it tracks or would track, once, if it is still there, hidden folders left out', () => {
    write({ 'a.fud': '', 'src/b.fud': '', 'ignored.log': '' });
    const asked: [string, readonly string[]][] = [];
    const git: Git = (root, args) => {
      asked.push([root, args]);
      return ['src/b.fud', 'a.fud', 'a.fud', 'deleted.fud', '.fudic/api/r.d.ts', 'dist/x.js', ''].join('\n');
    };
    expect(listFiles(dir.root, git)).toEqual(['a.fud', 'src/b.fud']);
    expect(asked).toEqual([[dir.root, ['ls-files', '--cached', '--others', '--exclude-standard']]]);
  });
});

describe('filesUnder', () => {
  beforeEach(() => {
    write({ 'src/a.fud': '', 'src/ab/c.fud': '', 'srcx/d.fud': '', 'e.json': '' });
  });

  it('the whole project, without a folder or with the project itself', () => {
    const all = ['e.json', 'src/a.fud', 'src/ab/c.fud', 'srcx/d.fud'];
    expect(filesUnder(dir.root, noGit)).toEqual({ files: all });
    expect(filesUnder(dir.root, noGit, '.')).toEqual({ files: all });
  });

  it('a folder: what is under it, not what only starts with its name; a file: itself', () => {
    expect(filesUnder(dir.root, noGit, 'src')).toEqual({ files: ['src/a.fud', 'src/ab/c.fud'] });
    expect(filesUnder(dir.root, noGit, 'src/a.fud')).toEqual({ files: ['src/a.fud'] });
  });

  it('a folder out of the project: FUD1400', () => {
    expect(filesUnder(dir.root, noGit, '..')).toEqual({ error: expect.objectContaining({ code: 'FUD1400' }) });
  });
});

describe('readLines', () => {
  const read = (path: string, offset = 1, limit = READ_LIMIT): ReturnType<typeof readLines> => readLines(dir.root, { path, offset, limit });

  it('numbers every line from 1, padded to the widest, without the break at the end', () => {
    write({ 'a.fud': '<p>\r\n  x\n</p>\n' });
    expect(read('a.fud')).toEqual({ body: { path: 'a.fud', lines: '1-3', total: 3, text: '  1→<p>\n  2→  x\n  3→</p>' } });
    expect(READ_LIMIT).toBe(400);
  });

  it('from offset, as many as limit; two spaces before the widest number', () => {
    write({ 'a.txt': Array.from({ length: 12 }, (_, i) => `l${i + 1}`).join('\n') });
    expect(read('a.txt', 9, 2)).toEqual({ body: { path: 'a.txt', lines: '9-10', total: 12, text: '   9→l9\n  10→l10' } });
    expect(read('a.txt', 11)).toMatchObject({ body: { lines: '11-12', text: '  11→l11\n  12→l12' } });
  });

  it('past the end: no lines', () => {
    write({ 'a.txt': 'one\n' });
    expect(read('a.txt', 5)).toEqual({ body: { path: 'a.txt', lines: 0, total: 1, text: '' } });
  });

  it('an empty file has no lines', () => {
    write({ 'empty.txt': '' });
    expect(read('empty.txt')).toEqual({ body: { path: 'empty.txt', lines: 0, total: 0, text: '' } });
  });

  it('a file that is not there: FUD1401, said with the path as the project names it', () => {
    expect(read('src/../gone.fud')).toEqual({ error: expect.objectContaining({ code: 'FUD1401', file: 'gone.fud', message: 'gone.fud does not exist' }) });
  });

  it('a binary file — a NUL in its first bytes —: FUD1401, not text', () => {
    write({ 'logo.png': Buffer.from([0x89, 0x50, 0x00, 0x47]) });
    expect(read('logo.png')).toEqual({ error: expect.objectContaining({ code: 'FUD1401', message: 'logo.png is not a text file' }) });
  });

  it.each([['../x'], ['.git/config'], ['node_modules/a/i.js']])('%s: FUD1400', (path) => {
    expect(read(path)).toEqual({ error: expect.objectContaining({ code: 'FUD1400' }) });
  });
});

describe('writeFile', () => {
  const text = (path: string): string => readFileSync(join(dir.root, path), 'utf8');

  it('the whole content, creating the folders it needs', () => {
    expect(writeFile(dir.root, { path: 'src/new/a.fud', content: '<p></p>\n' })).toEqual({ path: join(dir.root, 'src', 'new', 'a.fud'), shown: 'src/new/a.fud' });
    expect(text('src/new/a.fud')).toBe('<p></p>\n');
  });

  it('edits, in order, each on what the one before left; a $ in the new text is only a $', () => {
    write({ 'a.fud': 'one two three\n' });
    expect(writeFile(dir.root, { path: 'a.fud', edits: [{ old: 'one', new: 'uno $&' }, { old: 'uno $& two', new: 'dos' }] })).toMatchObject({ shown: 'a.fud' });
    expect(text('a.fud')).toBe('dos three\n');
  });

  it.each([
    ['not in the file', 'four', 0, 'does not contain "four"'],
    ['twice in the file', 'o', 2, 'contains "o" 2 times'],
    ['empty', '', 0, 'does not contain ""'],
  ])('an edit whose old is %s: FUD1402, and nothing written', (_why, old, found, words) => {
    write({ 'a.fud': 'one two\n' });
    const result = writeFile(dir.root, { path: 'a.fud', edits: [{ old: 'one', new: 'uno' }, { old, new: 'x' }] });
    expect(result).toEqual({ error: expect.objectContaining({ code: 'FUD1402', file: 'a.fud' }) });
    expect('error' in result && result.error.message).toContain(words);
    expect(found).toBeGreaterThanOrEqual(0);
    expect(text('a.fud')).toBe('one two\n');
  });

  it('edits to a file that is not there: FUD1401, and nothing created', () => {
    expect(writeFile(dir.root, { path: 'gone.fud', edits: [{ old: 'a', new: 'b' }] })).toEqual({ error: expect.objectContaining({ code: 'FUD1401' }) });
    expect(existsSync(join(dir.root, 'gone.fud'))).toBe(false);
  });

  it.each([['../x.fud'], ['.git/hooks/pre-commit'], ['node_modules/a/i.js'], ['.fudic/api/r.d.ts']])('%s is never written: FUD1400', (path) => {
    expect(writeFile(dir.root, { path, content: 'x' })).toEqual({ error: expect.objectContaining({ code: 'FUD1400', file: path }) });
  });
});
