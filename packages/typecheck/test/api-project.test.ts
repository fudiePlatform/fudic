/**
 * SDD-77 §8.2.9 and §8.2.11 — `@fudic/typecheck/api`: the one reader of a project's `.fudapi`
 * for the build, the dev server and the check, and the `.d.ts` it writes before a check.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { apiContextOf, apiDiagnostics, readApiProject, writeApiDeclarations } from '../src/api-project.js';
import { toPosix } from '../src/index.js';

const PAGE = '<!DOCTYPE html>\n<html>\n<head><link rel="server" href="./[id].fudapi"><title>t</title></head>\n<body><p>x</p></body>\n</html>\n';

let roots: string[] = [];

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-api-project-')));
  roots.push(root);
  for (const [relative, text] of Object.entries(files)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe('readApiProject', () => {
  it('the app under src/, by <id>, and the pipes and fudapi/ of each direct dependency', () => {
    const root = project({
      'package.json': JSON.stringify({ dependencies: { '@acme/ui': '1.0.0' }, devDependencies: { '@acme/none': '1.0.0' } }),
      'src/routes/products/[id].fudapi': 'load\n  name  str\n',
      'src/routes/.hidden/x.fudapi': 'load\n  n  i32\n',
      'node_modules/@acme/ui/fudapi/cart.fudapi': 'get count\n  -> i32\n',
      'node_modules/@acme/ui/src/pipes/shout.fudapi': 'pipe shout\n  on str\n  -> str\n',
    });
    const files = readApiProject(root);
    expect(files.sources.map((s) => [s.id, s.origin])).toEqual([
      ['routes/products/[id]', 'app'],
      ['@acme/ui/pipes/shout', { package: '@acme/ui' }],
      ['@acme/ui/cart', { package: '@acme/ui' }],
    ]);
    expect(files.libraries).toEqual([{ name: '@acme/ui', dir: `${root}/node_modules/@acme/ui`, server: 'server', browser: 'browser' }]);
    expect(files.byId.get('@acme/ui/cart')?.path).toBe(`${root}/node_modules/@acme/ui/fudapi/cart.fudapi`);
  });

  it('a library whose fudic.json moves its folders', () => {
    const root = project({
      'package.json': JSON.stringify({ dependencies: { lib: '1.0.0' } }),
      'node_modules/lib/fudic.json': JSON.stringify({ api: 'contracts', server: 'dist/server', browser: 'dist/browser' }),
      'node_modules/lib/contracts/a.fudapi': 'get a\n  -> i32\n',
    });
    expect(readApiProject(root).libraries).toEqual([{ name: 'lib', dir: `${root}/node_modules/lib`, server: 'dist/server', browser: 'dist/browser' }]);
  });

  it('a library project: its own pipes carry its package name; without a readable name, they do not', () => {
    const files = { 'fudic.json': JSON.stringify({ kind: 'lib' }), 'src/pipes/shout.fudapi': 'pipe shout\n  on str\n  -> str\n' };
    const named = project({ ...files, 'package.json': JSON.stringify({ name: '@acme/ui' }) });
    expect(readApiProject(named).sources.map((s) => s.id)).toEqual(['@acme/ui/pipes/shout']);
    const moved = project({
      'fudic.json': JSON.stringify({ kind: 'lib', pipes: 'lib/pipes' }),
      'package.json': JSON.stringify({ name: '@acme/ui' }),
      'lib/pipes/shout.fudapi': 'pipe shout\n  on str\n  -> str\n',
      'src/lib/pipes/other.fudapi': 'pipe other\n  on str\n  -> str\n',
    });
    // Only the folder its fudic.json names is its pipes: under src/, it is the app's.
    expect(readApiProject(moved).sources.map((s) => s.id)).toEqual(['lib/pipes/other']);
    for (const pkg of [undefined, '{', JSON.stringify({ name: 7 })]) {
      const root = project(pkg === undefined ? files : { ...files, 'package.json': pkg });
      expect(readApiProject(root).sources.map((s) => s.id)).toEqual(['pipes/shout']);
    }
  });
});

describe('apiContextOf', () => {
  it('a sibling of a route: its params and its pattern', () => {
    const root = project({ 'src/routes/products/[id].fudapi': 'load\n  name  str\n', 'src/routes/products/[id].fud': PAGE });
    const source = readApiProject(root).sources[0]!;
    expect(apiContextOf(root, source)).toEqual({ route: { params: ['id'], pattern: '/products/:id' } });
  });

  it('a route that links components: the <id> of each one with a .fudapi (SDD-82 §3.4)', () => {
    const links = [
      '<link rel="component" href="../../components/user-card.fud">',
      '<link rel="component" href="../../components/plain.fud">',
      '<link rel="component" href="../../../outside/x.fud">',
    ].join('');
    const root = project({
      'src/routes/products/[id].fudapi': 'load\n  name  str\n',
      'src/routes/products/[id].fud': PAGE.replace('<title>', `${links}<title>`),
      'src/components/user-card.fudapi': 'post vote\n',
      'src/components/plain.fud': '',
      'outside/x.fudapi': 'post x\n',
    });
    const source = readApiProject(root).sources.find((s) => s.id === 'routes/products/[id]')!;
    expect(apiContextOf(root, source)).toEqual({ route: { params: ['id'], pattern: '/products/:id', components: ['components/user-card'] } });
  });

  it('the error page of a folder, and the index of a folder', () => {
    const root = project({
      'src/routes/shop/_error.fudapi': 'load\n  n  i32\n',
      'src/routes/shop/_error.fud': PAGE.replace('[id]', '_error'),
      'src/routes/shop/index.fudapi': 'load\n  n  i32\n',
      'src/routes/shop/index.fud': PAGE.replace('[id]', 'index'),
    });
    const [error, index] = readApiProject(root).sources;
    expect(apiContextOf(root, error!)).toEqual({ route: { params: [], pattern: '/shop/_error', error: true } });
    expect(apiContextOf(root, index!)).toEqual({ route: { params: [], pattern: '/shop' } });
  });

  it('a route with a layout: the props its layout declares', () => {
    const layout = '<!DOCTYPE html>\n<html lang="@culture">\n<head>\n@code {\n  const { culture } = props<{ culture: string }>();\n}\n<title>t</title>\n@RenderHead()\n</head>\n<body>@RenderBody()</body>\n</html>\n';
    const root = project({
      'src/layouts/_layout.fud': layout,
      'src/routes/l.fudapi': 'load\n  n  i32\n',
      'src/routes/l.fud': '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./l.fudapi">\n\n<h1>x</h1>\n',
    });
    const context = apiContextOf(root, readApiProject(root).sources[0]!);
    expect(context.route?.layoutProps).toEqual(expect.any(String));
  });

  it('nothing for a .fudapi with no route beside it', () => {
    const root = project({ 'src/rules/r.fudapi': 'rule r\n  on field str\n  runs server\n  fails taken\n' });
    expect(apiContextOf(root, readApiProject(root).sources[0]!)).toEqual({});
  });
});

describe('apiDiagnostics', () => {
  it('every app file, with its text — a clean one too, for its comments (SDD-83): load outside a route is FUD1090', () => {
    const root = project({
      'src/data/d.fudapi': 'load\n  n  i32\n',
      'src/routes/ok.fudapi': 'load\n  n  i32\n',
      'src/routes/ok.fud': PAGE.replace('[id]', 'ok'),
    });
    const found = apiDiagnostics(root);
    expect(found.map((f) => [f.file.slice(root.length + 1), f.diagnostics.map((d) => d.code)]).sort()).toEqual([
      ['src/data/d.fudapi', ['FUD1090']],
      ['src/routes/ok.fudapi', []],
    ]);
    expect(found.every((f) => f.source === 'load\n  n  i32\n')).toBe(true);
  });
});

describe('writeApiDeclarations', () => {
  it('writes .fudic/api/<id>.d.ts, and only what changed', () => {
    const root = project({ 'src/routes/r.fudapi': 'load\n  n  i32\n', 'src/routes/r.fud': PAGE.replace('[id]', 'r') });
    const target = `${root}/.fudic/api/routes/r.d.ts`;
    expect(writeApiDeclarations(root)).toEqual([target]);
    expect(readFileSync(target, 'utf8')).toContain('Generated by fudic from routes/r');
    const first = statSync(target).mtimeMs;

    // The same text: not written, its date kept.
    expect(writeApiDeclarations(root)).toEqual([]);
    expect(statSync(target).mtimeMs).toBe(first);

    writeFileSync(join(root, 'src/routes/r.fudapi'), 'load\n  n  i32\n  name  str\n');
    expect(writeApiDeclarations(root)).toEqual([target]);
    expect(readFileSync(target, 'utf8')).toContain('name');
  });

  it('a project without .fudapi writes nothing', () => {
    expect(writeApiDeclarations(project({}))).toEqual([]);
  });
});
