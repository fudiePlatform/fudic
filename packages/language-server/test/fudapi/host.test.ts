/**
 * SDD-60 §3.10, §4.9 and criterion 9 (the host's half) — the `.fudapi` host: which files make a
 * project, where a file sits, and when what it read goes stale.
 */

import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toPosix } from '@fudic/typecheck';
import { nodeApiFs } from '../../src/fudapi/fs.js';
import { ApiHost } from '../../src/fudapi/host.js';
import { APP, FILES, FORMS, PACKAGE, ROOT, SRC, world } from './_api.js';

const PATH = `${SRC}/components/x.fudapi`;

/** The ids of the project of `path`, as its index lists them. */
const ids = (host: ApiHost, path = PATH, text = ''): readonly string[] => host.load(path, text).index.sources.map((s) => s.id);

describe('the project of a file (criterion 9)', () => {
  it('reads the app under src/ and the fudapi/ of each direct dependency', () => {
    const { host } = world();
    expect(ids(host)).toEqual([
      '@fudic/forms/rules',
      '@fudic/forms/patterns',
      '@fudic/http/middlewares',
      '@fudic/dev/dev',
      'middlewares/auth',
      'types/person',
      'components/x',
    ]);
  });

  it('a dependency without fudapi/ adds nothing; one not in package.json is never read', () => {
    const { host, fs } = world();
    host.load(PATH, '');
    expect(fs.reads.some((p) => p.includes('/no-api/'))).toBe(false);
    expect(fs.reads.some((p) => p.includes('/transitive/'))).toBe(false);
  });

  it('leaves out node_modules and dot folders under src/', () => {
    const { host } = world();
    const index = host.load(PATH, '').index;
    expect(index.lookup('type', 'Hidden')).toBeUndefined();
    expect(index.lookup('type', 'Dotted')).toBeUndefined();
  });

  it('a name of the app and one of a library resolve with no imports', () => {
    const { host } = world();
    const index = host.load(PATH, '').index;
    expect(index.lookup('type', 'Person')!.source.path).toBe(`${SRC}/types/person.fudapi`);
    expect(index.lookup('rule', 'required')!.source).toMatchObject({
      path: `${FORMS}/rules.fudapi`,
      origin: { package: '@fudic/forms' },
    });
  });

  it('a project with no package.json, or a broken one, has no dependencies', () => {
    const files = { ...FILES };
    delete files[`${APP}/package.json`];
    // With no package.json the project is the workspace folder: no src/ there, so the file
    // is named by its file name alone.
    expect(ids(world({ files }).host)).toEqual(['x']);
    const broken = world({ files: { ...FILES, [`${APP}/package.json`]: '{ "dependencies": ' } });
    expect(ids(broken.host)).toEqual(['middlewares/auth', 'types/person', 'components/x']);
    const empty = world({ files: { ...FILES, [`${APP}/package.json`]: '{}' } });
    expect(ids(empty.host)).toEqual(['middlewares/auth', 'types/person', 'components/x']);
  });

  it('the project is the nearest folder with a package.json inside the workspace folder', () => {
    const { host } = world({ files: { ...FILES, '/package.json': '{}', [`${SRC}/components/package.json`]: undefined } });
    expect(host.projectOf(PATH)).toBe(APP);
    // Above the workspace folder: never a project.
    expect(world({ files: { '/package.json': '{}' } }).host.projectOf(`${ROOT}/a/b.fudapi`)).toBe(ROOT);
  });

  it('takes the longest workspace folder that holds the file; outside all, its own folder', () => {
    const { host } = world({ roots: [ROOT, `${ROOT}/other`], files: {} });
    expect(host.projectOf(`${ROOT}/other/x/y.fudapi`)).toBe(`${ROOT}/other`);
    const reversed = world({ roots: [`${ROOT}/other`, ROOT], files: {} }).host;
    expect(reversed.projectOf(`${ROOT}/other/x/y.fudapi`)).toBe(`${ROOT}/other`);
    expect(host.projectOf('/elsewhere/z/y.fudapi')).toBe('/elsewhere/z');
  });

  it('a file outside src/ is still indexed under its name', () => {
    const { host } = world();
    const source = host.load(`${APP}/loose.fudapi`, 'type Loose\n  x  str').source;
    expect(source.id).toBe('loose');
    expect(source.origin).toBe('app');
  });

  it('the file being edited replaces its copy on disk', () => {
    const { host } = world();
    const project = host.load(`${SRC}/types/person.fudapi`, 'type Persona\n  name  str');
    expect(project.index.lookup('type', 'Person')).toBeUndefined();
    expect(project.index.lookup('type', 'Persona')).toBeDefined();
  });

  it('another open file speaks with its editor text', () => {
    const { host } = world({ open: { [`${SRC}/types/person.fudapi`]: 'type Gente\n  x  str' } });
    const index = host.load(PATH, '').index;
    expect(index.lookup('type', 'Gente')).toBeDefined();
    expect(index.lookup('type', 'Person')).toBeUndefined();
    expect(host.read(`${SRC}/types/person.fudapi`)).toBe('type Gente\n  x  str');
  });

  it('a listed file that cannot be read is an empty one', () => {
    const { host } = world({ files: { ...FILES, [`${SRC}/types/person.fudapi`]: undefined } });
    expect(host.load(PATH, '').index.sources.find((s) => s.id === 'types/person')!.file.declarations).toEqual([]);
  });

  it('gives the parse diagnostics of the file itself', () => {
    const { host } = world();
    expect(host.load(PATH, 'frob').parseDiagnostics.map((d) => d.code)).toEqual(['FUD1062']);
  });

  it('parses a file again only when its text changed', () => {
    const { host } = world();
    const first = host.load(PATH, 'type A\n  x  str').source.file;
    expect(host.load(PATH, 'type A\n  x  str').source.file).toBe(first);
    expect(host.load(PATH, 'type B\n  x  str').source.file).not.toBe(first);
  });
});

describe('when the files are read again', () => {
  it('keeps the list of files until invalidated', () => {
    const { fs } = world();
    let lists = 0;
    const counting = new ApiHost({
      fs: { readFile: (p) => fs.readFile(p), list: (p) => (lists++, fs.list(p)), writeFile: () => {}, removeFile: () => {} },
      roots: () => [ROOT],
      open: () => undefined,
    });
    counting.load(PATH, '');
    const once = lists;
    counting.load(`${SRC}/types/person.fudapi`, '');
    expect(lists).toBe(once);
    counting.invalidate();
    counting.load(PATH, '');
    expect(lists).toBe(once * 2);
  });

  it('a .fudapi or a package.json can change what a .fudapi says; nothing else can', () => {
    expect(ApiHost.affects(`${SRC}/a.fudapi`)).toBe(true);
    expect(ApiHost.affects(`${APP}/package.json`)).toBe(true);
    expect(ApiHost.affects(`${SRC}/a.fud`)).toBe(false);
    expect(ApiHost.affects(`${APP}/tsconfig.json`)).toBe(false);
    expect(ApiHost.affects(`${APP}/my-package.json`)).toBe(false);
  });
});

describe('where a file sits (SDD-60 §3.4)', () => {
  const contextOf = (path: string): unknown => world().host.load(path, '').context;

  it('the sibling of a route is a route, with no parameters', () => {
    expect(contextOf(`${SRC}/routes/usuarios.fudapi`)).toEqual({ route: { params: [], pattern: '/usuarios' } });
  });

  it('the parameters come from the route path', () => {
    expect(contextOf(`${SRC}/routes/blog/[slug].fudapi`)).toEqual({ route: { params: ['slug'], pattern: '/blog/:slug' } });
  });

  it('the sibling of _error.fud is the error page', () => {
    expect(contextOf(`${SRC}/routes/_error.fudapi`)).toEqual({ route: { params: [], pattern: '/_error', error: true } });
  });

  it('a file under routes/ with no .fud beside it, or outside routes/, is no route', () => {
    expect(contextOf(`${SRC}/routes/orphan.fudapi`)).toEqual({});
    expect(contextOf(`${SRC}/components/usuarios.fudapi`)).toEqual({});
  });
});

describe('the disk', () => {
  function tree(): string {
    const root = toPosix(mkdtempSync(join(tmpdir(), 'fudapi-')));
    mkdirSync(`${root}/src/routes`, { recursive: true });
    mkdirSync(`${root}/store/@fudic/forms/fudapi`, { recursive: true });
    mkdirSync(`${root}/node_modules/@fudic`, { recursive: true });
    writeFileSync(`${root}/package.json`, PACKAGE);
    writeFileSync(`${root}/src/routes/a.fudapi`, 'type A\n  x  str\n');
    writeFileSync(`${root}/store/@fudic/forms/fudapi/rules.fudapi`, 'type FromLink\n  x  str\n');
    // pnpm links a dependency to the store; a junction needs no privileges on Windows.
    symlinkSync(`${root}/store/@fudic/forms`, `${root}/node_modules/@fudic/forms`, 'junction');
    symlinkSync(`${root}/nowhere`, `${root}/node_modules/@fudic/http`, 'junction');
    return root;
  }

  it('reads files, lists folders and follows a linked dependency', () => {
    const root = tree();
    const fs = nodeApiFs();
    expect(fs.readFile(`${root}/src/routes/a.fudapi`)).toBe('type A\n  x  str\n');
    expect(fs.list(`${root}/node_modules/@fudic`).map((e) => [e.name, e.directory]).sort()).toEqual([
      ['forms', true],
      ['http', false],
    ]);
    const host = new ApiHost({ fs, roots: () => [root], open: () => undefined });
    expect(host.load(`${root}/src/routes/a.fudapi`, 'type A\n  x  str').index.lookup('type', 'FromLink')).toBeDefined();
  });

  it('a file or a folder that is not there is nothing, never a throw', () => {
    const fs = nodeApiFs();
    expect(fs.readFile('/no/such/file.fudapi')).toBeUndefined();
    expect(fs.list('/no/such/folder')).toEqual([]);
  });
});
