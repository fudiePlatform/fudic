/**
 * SDD-82 §8.2.7 and §8.2.9 — what a `.fudspec` of a page or a flow can call, read off the
 * project's `.fudapi`: the `reach` and `functions` the editor and the check give `specContextOf`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApiIndex, parseApi, type ApiSource, type FnDecl } from '@fudic/api';
import { linkedComponentIds, routeParams, specReach } from '../src/api-project.js';
import { createProjectChecker, toPosix } from '../src/index.js';

const ROOT = '/app';
const SRC = `${ROOT}/src`;
const source = (id: string, text: string): ApiSource => ({ id, path: `${SRC}/${id}.fudapi`, file: parseApi(text).value, origin: 'app' });

const USERS = source('routes/usuarios', 'get search\n  q  str\n');
const BLOG = source('routes/blog/[slug]', 'paths\n\npost like\n  n  i32\n');
const LISTA = source('components/lista', 'delete remove\n  id  i32\n');
const SOURCES = [USERS, BLOG, LISTA];
/** The span of the name of a file's first declaration, a function. */
const nameSpan = (s: ApiSource) => (s.file.declarations[0] as FnDecl).name.span;

const TEXTS: Readonly<Record<string, string>> = {
  [`${SRC}/routes/usuarios.fud`]: [
    '<link rel="component" href="../components/lista.fud">',
    '<link rel="component" href="../components/sin-api.fud">',
    '<link rel="component" href="../../fuera/otro.fud">',
    '<app-usuarios></app-usuarios>',
  ].join('\n'),
};

const reach = specReach({
  root: ROOT,
  index: createApiIndex(SOURCES),
  source: (path) => SOURCES.find((s) => s.path === path),
  read: (path) => TEXTS[path],
});

describe('specReach', () => {
  it('a page reaches its own functions and those of the app components it links that have a .fudapi', () => {
    expect(reach.reach(`${SRC}/routes/usuarios.fud`)).toEqual({
      paths: false,
      functions: [
        { name: 'search', args: ['q'], path: USERS.path, span: nameSpan(USERS) },
        { name: 'remove', args: ['id'], path: LISTA.path, span: nameSpan(LISTA) },
      ],
    });
  });

  it('says whether the route declares paths, and calls with its params', () => {
    const blog = reach.reach(`${SRC}/routes/blog/[slug].fud`);
    expect(blog.paths).toBe(true);
    expect(blog.functions.map((f) => [f.name, f.args])).toEqual([['like', ['slug', 'n']]]);
  });

  it('a page without a .fudapi or a text reaches nothing of its own', () => {
    expect(reach.reach(`${SRC}/routes/about.fud`)).toEqual({ paths: false, functions: [] });
  });

  it('a flow reaches every function of the project', () => {
    expect(reach.functions().map((f) => f.name)).toEqual(['search', 'like', 'remove']);
  });
});

describe('the pieces', () => {
  it('reads the params of a route off its path', () => {
    expect(routeParams(ROOT, `${SRC}/routes/blog/[slug]/[id].fud`)).toEqual(['slug', 'id']);
    expect(routeParams(ROOT, `${SRC}/routes/index.fud`)).toEqual([]);
  });

  it('keeps the linked components of the app with a .fudapi, by their id', () => {
    const page = `${SRC}/routes/usuarios.fud`;
    expect(linkedComponentIds(ROOT, page, TEXTS[page]!, (api) => api === LISTA.path)).toEqual(['components/lista']);
  });
});

/** A project on disk for `check()`. */
function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-spec-reach-')));
  for (const [relative, text] of Object.entries(files)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

const TERM = (name: string, params: string): string =>
  `export const meta = { name: '${name}', block: 'then', params: [${params}] };\nexport async function run(ctx) {}\nexport const selfTest = [];\n`;

describe('the check validates what a page can call (FUD1506, FUD1507, FUD1513)', () => {
  it('reports a function out of reach, a field it does not take and lists on a route without paths', () => {
    const spec = [
      'page /usuarios',
      '',
      'criterion a',
      '  then',
      '    called search 1',
      '    called nope 1',
      '    sent search name "x"',
      '    lists x',
      '',
    ].join('\n');
    const root = project({
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true }, include: ['src/**/*.fud'] }),
      'src/routes/usuarios.fud': '<article>hi</article>\n',
      'src/routes/usuarios.fudapi': 'get search\n  q  str\n',
      'src/routes/usuarios.fudspec': spec,
      'fudic/terms/then/called.js': TERM('called', "{ name: 'fn', type: 'token' }, { name: 'times', type: 'number' }"),
      'fudic/terms/then/sent.js': TERM('sent', "{ name: 'fn', type: 'token' }, { name: 'field', type: 'token' }, { name: 'expected', type: 'string' }"),
      'fudic/terms/then/lists.js': TERM('lists', "{ name: 'value', type: 'string' }"),
    });
    try {
      const report = createProjectChecker({ root }).check();
      const found = report.problems.filter((p) => p.file.endsWith('.fudspec')).map((p) => [p.code, spec.slice(p.span.start, p.span.end)]);
      expect(found).toEqual([
        ['FUD1506', 'nope'],
        ['FUD1507', 'name'],
        ['FUD1513', 'lists'],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
