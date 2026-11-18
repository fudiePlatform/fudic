/**
 * SDD-88 §3.5 and §3.6, criteria 8-11 (the check's half): the error page of a project is a page,
 * and links a layout. `src/routes/_error.fud` of an app or `src/_error.fud` of a library that is
 * not a route is `FUD1581`, over its first line; a whole document with no hole says `FUD1580`
 * alone; one that links a layout says neither. Any other `_error.fud` is nobody's error page.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { apiContextOf, readApiProject, writeApiDeclarations } from '../src/api-project.js';
import { createProjectChecker, FudIndex, fudicDiagnostics, nodeFileSystem, toPosix, type CheckProblem } from '../src/index.js';
import { describeFud } from '../src/fud-index.js';
import { projected } from './_support.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
  include: ['**/*.ts', '**/*.fud'],
});

const LAYOUT = '<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n';

/** Not a route: no doctype and no `<link rel="layout">` — the error page of SDD-87, minus its shell. */
const BARE = '<h1>@data.status · @data.title</h1>\n<a href=@data.home>home</a>\n';

/** A component: a host tag with its template. */
const COMPONENT = '<app-oops>\n  <template shadowrootmode="open"><p>oops</p></template>\n</app-oops>\n';

/** A whole document with no hole: a page that writes its own shell. */
const WHOLE = '<!DOCTYPE html>\n<html>\n<head><title>@data.status</title></head>\n<body><h1>@data.title</h1></body>\n</html>\n';

/** A route that links a layout of its project, `href` from where it is. */
const ROUTE = (href: string): string => `<link rel="layout" href="${href}">\n<head><title>@data.status</title></head>\n<h1>@data.title</h1>\n`;

const APP = JSON.stringify({ kind: 'app', prefix: 'app' });
const LIB = JSON.stringify({ kind: 'lib', prefix: 'ui' });

let roots: string[] = [];

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-error-page-')));
  roots.push(root);
  for (const [relative, text] of Object.entries({ 'tsconfig.json': TSCONFIG, ...files })) {
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

const problems = (root: string): readonly CheckProblem[] => createProjectChecker({ root }).check().problems;

/** `file code` of every problem the check finds in `file`, fudic's only. */
const codesIn = (root: string, file: string): readonly string[] =>
  problems(root)
    .filter((p) => p.file === `${root}/${file}` && typeof p.code === 'string' && p.code.startsWith('FUD'))
    .map((p) => String(p.code));

describe('criterion 8: an app error page that links no layout is FUD1581', () => {
  it('a bare src/routes/_error.fud: FUD1581 over its first line, an error that says to link a layout', () => {
    const root = project({ 'fudic.json': APP, 'src/routes/_error.fud': BARE });
    const found = problems(root).filter((p) => p.code === 'FUD1581');
    expect(found).toHaveLength(1);
    expect(found[0]!.file).toBe(`${root}/src/routes/_error.fud`);
    expect(found[0]!.severity).toBe('error');
    expect(found[0]!.span).toEqual({ start: 0, end: BARE.indexOf('\n') });
    expect(found[0]!.message).toContain('<link rel="layout"');
  });

  it('a component written as src/routes/_error.fud: FUD1581 too', () => {
    const root = project({ 'fudic.json': APP, 'src/routes/_error.fud': COMPONENT });
    expect(codesIn(root, 'src/routes/_error.fud')).toContain('FUD1581');
  });

  it('a file of one line: the span is the whole file', () => {
    const one = '<h1>oops</h1>';
    const root = project({ 'fudic.json': APP, 'src/routes/_error.fud': one });
    expect(problems(root).find((p) => p.code === 'FUD1581')?.span).toEqual({ start: 0, end: one.length });
  });

  it('a well-formed layout as the error page: exactly FUD1581 (it is not a route)', () => {
    const root = project({ 'fudic.json': APP, 'src/routes/_error.fud': LAYOUT });
    expect(codesIn(root, 'src/routes/_error.fud')).toEqual(['FUD1581']);
  });
});

describe('criterion 9: a library error page that links no layout is FUD1581', () => {
  it('a bare src/_error.fud of a library: FUD1581 over its first line', () => {
    const root = project({ 'fudic.json': LIB, 'src/_error.fud': BARE });
    const found = problems(root).filter((p) => p.code === 'FUD1581');
    expect(found.map((p) => [p.file, p.span])).toEqual([[`${root}/src/_error.fud`, { start: 0, end: BARE.indexOf('\n') }]]);
  });

  it('a well-formed layout as the library error page: exactly FUD1581', () => {
    const root = project({ 'fudic.json': LIB, 'src/_error.fud': LAYOUT });
    expect(codesIn(root, 'src/_error.fud')).toEqual(['FUD1581']);
  });

  it('a library error page that links a layout of the library says nothing', () => {
    const root = project({ 'fudic.json': LIB, 'src/_error.fud': ROUTE('./layouts/_layout.fud'), 'src/layouts/_layout.fud': LAYOUT });
    expect(codesIn(root, 'src/_error.fud')).toEqual([]);
  });
});

describe('only the error page of the project is one', () => {
  it('src/_error.fud of an app, src/routes/_error.fud of a library, and one in another folder: no FUD1581', () => {
    const app = project({ 'fudic.json': APP, 'src/_error.fud': BARE, 'src/components/_error.fud': BARE, 'src/routes/shop/_error.fud': BARE });
    expect(problems(app).filter((p) => p.code === 'FUD1581')).toEqual([]);
    const lib = project({ 'fudic.json': LIB, 'src/routes/_error.fud': BARE, 'src/components/_error.fud': BARE });
    expect(problems(lib).filter((p) => p.code === 'FUD1581')).toEqual([]);
  });

  it('a file of another name in the right place is not the error page', () => {
    const root = project({ 'fudic.json': APP, 'src/routes/error.fud': BARE, 'src/routes/x_error.fud': BARE });
    expect(problems(root).filter((p) => p.code === 'FUD1581')).toEqual([]);
  });

  it('the nearest fudic.json decides: an app inside a library folder answers for its own', () => {
    const root = project({
      'fudic.json': LIB,
      'apps/shop/fudic.json': APP,
      'apps/shop/src/routes/_error.fud': BARE,
      'apps/shop/src/_error.fud': BARE,
    });
    const found = problems(root).filter((p) => p.code === 'FUD1581').map((p) => p.file);
    expect(found).toEqual([`${root}/apps/shop/src/routes/_error.fud`]);
  });

  it('an unreadable fudic.json reads as an app', () => {
    const root = project({ 'fudic.json': '{ not json', 'src/routes/_error.fud': BARE, 'src/_error.fud': BARE });
    const found = problems(root).filter((p) => p.code === 'FUD1581').map((p) => p.file);
    expect(found).toEqual([`${root}/src/routes/_error.fud`]);
  });
});

describe('criterion 10: one fact, one voice', () => {
  it('an app error page with a doctype and no hole: FUD1580, not FUD1581', () => {
    const root = project({ 'fudic.json': APP, 'src/routes/_error.fud': WHOLE });
    const codes = codesIn(root, 'src/routes/_error.fud');
    expect(codes).toContain('FUD1580');
    expect(codes).not.toContain('FUD1581');
  });

  it('the same in a library', () => {
    const root = project({ 'fudic.json': LIB, 'src/_error.fud': WHOLE });
    const codes = codesIn(root, 'src/_error.fud');
    expect(codes).toContain('FUD1580');
    expect(codes).not.toContain('FUD1581');
  });

  it('an error page that links a layout says neither', () => {
    const root = project({ 'fudic.json': APP, 'src/routes/_error.fud': ROUTE('../layouts/_layout.fud'), 'src/layouts/_layout.fud': LAYOUT });
    expect(codesIn(root, 'src/routes/_error.fud')).toEqual([]);
  });
});

describe('fudicDiagnostics and the index', () => {
  it('the index decides; one without errorPage (a host that cannot tell) has no error page', () => {
    const { index, document } = projected('/p/src/routes/_error.fud', BARE, { '/p/fudic.json': APP });
    expect(fudicDiagnostics(document, index).map((d) => d.code)).toContain('FUD1581');
    const blind = new Proxy(index, { get: (target, key) => (key === 'errorPage' ? undefined : Reflect.get(target, key, target)) });
    expect(fudicDiagnostics(document, blind).map((d) => d.code)).not.toContain('FUD1581');
  });

  it('FudIndex.errorPage: by the nearest fudic.json, its kind, and the name', () => {
    const app = project({ 'fudic.json': APP });
    const lib = project({ 'fudic.json': LIB });
    const loose = toPosix(mkdtempSync(join(tmpdir(), 'fudic-error-page-loose-')));
    roots.push(loose);
    const index = new FudIndex(nodeFileSystem(), describeFud);
    expect(index.errorPage(`${app}/src/routes/_error.fud`)).toBe(true);
    expect(index.errorPage(`${app}/src/_error.fud`)).toBe(false);
    expect(index.errorPage(`${lib}/src/_error.fud`)).toBe(true);
    expect(index.errorPage(`${lib}/src/routes/_error.fud`)).toBe(false);
    expect(index.errorPage(`${app}/src/routes/index.fud`)).toBe(false);
    // Windows separators read as POSIX.
    expect(index.errorPage(`${app}/src/routes/_error.fud`.replaceAll('/', '\\'))).toBe(true);
    // No fudic.json anywhere above, and no project swept there: nobody's error page.
    expect(index.errorPage(`${loose}/src/routes/_error.fud`)).toBe(false);
  });

  it('a project with no fudic.json is an app: the check says FUD1581 for its src/routes/_error.fud, as the build does', () => {
    const root = project({ 'src/routes/_error.fud': '<h1>x</h1>\n' });
    expect(codesIn(root, 'src/routes/_error.fud')).toContain('FUD1581');
    // Its src/_error.fud is no app's error page.
    const other = project({ 'src/_error.fud': '<h1>x</h1>\n' });
    expect(codesIn(other, 'src/_error.fud')).not.toContain('FUD1581');
  });
});

/** SDD-88 §3.6, criterion 11: `layout` in `_error.fudapi` returns the props of the layout the error page links. */
describe('criterion 11: layout in _error.fudapi', () => {
  it('an app error page: its context is an error page with the props of its layout, and the .d.ts types data as ErrorPage', () => {
    const root = project({
      'fudic.json': APP,
      'src/layouts/_layout.fud': LAYOUT,
      'src/routes/_error.fud': ROUTE('../layouts/_layout.fud'),
      'src/routes/_error.fudapi': 'layout\n',
    });
    const source = readApiProject(root).sources.find((s) => s.id === 'routes/_error')!;
    expect(apiContextOf(root, source)).toEqual({
      route: { params: [], pattern: '/_error', error: true, layoutProps: "import('../../../src/layouts/_layout.fud').$Props" },
    });
    writeApiDeclarations(root);
    const dts = nodeFileSystem().readFile(`${root}/.fudic/api/routes/_error.d.ts`) ?? '';
    expect(dts).toContain("data: ErrorPage) => import('../../../src/layouts/_layout.fud').$Props");
  });

  it('a library error page that links no layout (FUD1581): an error page still, with no props to return', () => {
    const root = project({ 'fudic.json': LIB, 'src/_error.fud': BARE, 'src/_error.fudapi': 'layout\n' });
    expect(apiContextOf(root, readApiProject(root).sources[0]!)).toEqual({ route: { params: [], error: true } });
  });

  it('a library error page: the same, from its own layout', () => {
    const root = project({
      'fudic.json': LIB,
      'src/layouts/_layout.fud': LAYOUT,
      'src/_error.fud': ROUTE('./layouts/_layout.fud'),
      'src/_error.fudapi': 'layout\n',
    });
    const source = readApiProject(root).sources[0]!;
    expect(apiContextOf(root, source)).toEqual({
      route: { params: [], error: true, layoutProps: "import('../../src/layouts/_layout.fud').$Props" },
    });
  });
});
