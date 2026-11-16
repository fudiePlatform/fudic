/**
 * SDD-83 §3.8 and §4.1, criteria 16 and 30 — what Baseline says of a project as a whole: one
 * `FUD1526` per library that uses, unguarded, what the app does not accept, and `FUD1528` for an
 * id of `allow` nothing uses. Through the project checker over a real project on disk.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { readProjectConfig, type ProjectConfig } from '@fudic/config';
import {
  createProjectChecker,
  packageBaselineUses,
  projectBaselineDiagnostics,
  toPosix,
  type CheckProblem,
} from '../src/index.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2024',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    lib: ['ES2024', 'DOM'],
  },
  include: ['**/*.ts', '**/*.fud'],
});

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-baseline-project-')));
  for (const [relative, text] of Object.entries({ 'tsconfig.json': TSCONFIG, ...files })) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

/** A component of `prefix` with `style` in its `<style>` and `code` in its `@code`. */
function component(tag: string, style = '', code = ''): string {
  return `@code {\n${code}\n}\n<head><style>${style}</style></head>\n<${tag}>\n  <template shadowrootmode="open"><p>x</p></template>\n</${tag}>\n`;
}

/** An app that depends on `@acme/ui`, a library whose note writes `field-sizing` unguarded. */
function withLibrary(app: object, extra: Readonly<Record<string, string>> = {}, library: object = { name: '@acme/ui' }): string {
  return project({
    'package.json': JSON.stringify({ name: 'app', dependencies: { '@acme/ui': '1.0.0' } }),
    'fudic.json': JSON.stringify(app),
    'node_modules/@acme/ui/package.json': JSON.stringify({ version: '1.0.0', ...library }),
    'node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'acme', baseline: 'newly' }),
    // Unguarded: counts. Guarded by its `@supports`: does not.
    'node_modules/@acme/ui/acme-note.fud': component(
      'acme-note',
      'textarea { field-sizing: content; } @supports selector(:state(x)) { :host(:state(x)) { color: red; } }',
    ),
    'src/routes/index.fud': `<!DOCTYPE html>\n<html>\n  <head><title>t</title></head>\n  <body><p>x</p></body>\n</html>\n`,
    ...extra,
  });
}

const ofConfig = (root: string, problems: readonly CheckProblem[]): CheckProblem[] =>
  problems.filter((problem) => problem.file === `${root}/fudic.json`);

describe('a library in the app (criterion 30)', () => {
  it('a library on newly that writes field-sizing unguarded, in an app on widely: one FUD1526 on "baseline"', () => {
    const text = { id: 'app', baseline: 'widely' };
    const root = withLibrary(text);
    const found = ofConfig(root, createProjectChecker({ root }).check().problems);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ code: 'FUD1526', severity: 'warning' });
    expect(found[0]!.message).toBe("`@acme/ui` uses features this app's Baseline does not accept: field-sizing");
    const written = JSON.stringify(text);
    expect(found[0]!.span).toEqual({ start: written.indexOf('"baseline"'), end: written.indexOf('"baseline"') + 10 });
  });

  it('allowing field-sizing in the app takes it away, and the id is used by the library: no FUD1528', () => {
    const root = withLibrary({ id: 'app', baseline: { target: 'widely', allow: ['field-sizing'] }, diagnostics: { FUD1528: 'warning' } });
    expect(ofConfig(root, createProjectChecker({ root }).check().problems)).toEqual([]);
  });

  it('with no "baseline" written it is about the whole file; a library with no name goes by its folder', () => {
    const root = withLibrary({ id: 'app' }, {}, {});
    const found = ofConfig(root, createProjectChecker({ root }).check().problems);
    expect(found.map((p) => [p.code, p.span])).toEqual([['FUD1526', { start: 0, end: 0 }]]);
    expect(found[0]!.message).toContain('/node_modules/@acme/ui` uses');
  });

  it("a library imposes nothing on another library, and the project's policy says how it is reported", () => {
    const lib = withLibrary({ kind: 'lib', prefix: 'mine' });
    expect(ofConfig(lib, createProjectChecker({ root: lib }).check().problems)).toEqual([]);
    const raised = withLibrary({ id: 'app', diagnostics: { FUD1526: 'error' } });
    expect(ofConfig(raised, createProjectChecker({ root: raised }).check().problems).map((p) => p.severity)).toEqual(['error']);
  });

  it('a project with no fudic.json says nothing of itself', () => {
    const root = project({ 'src/app-x.fud': component('app-x', 'textarea { field-sizing: content; }') });
    expect(ofConfig(root, createProjectChecker({ root }).check().problems)).toEqual([]);
  });
});

describe('an id of allow nothing uses (criterion 16)', () => {
  /** An app that allows four features and uses some of them, each in a different kind of file. */
  function allowing(allow: readonly string[]): readonly string[] {
    const root = project({
      'fudic.json': JSON.stringify({
        id: 'app',
        prefix: 'app',
        baseline: { allow },
        styles: { theme: 'src/styles/theme.css', gone: 'src/styles/gone.css' },
        guide: { sheet: 'src/guide/guide.css' },
        // A hint does not reach the report: raised, it does.
        diagnostics: { FUD1528: 'warning' },
      }),
      'src/styles/theme.css': ':host(:state(open)) { color: red; }',
      'src/guide/guide.css': `@import './nested.css';\n@import './missing.css';\n`,
      'src/guide/nested.css': '.x { anchor-name: --a; }',
      'src/browser/menu.ts': `export function open(el: HTMLElement): void {\n  el.showPopover();\n}\n`,
      'src/app-x.fud': component('app-x', 'textarea { field-sizing: content; }'),
    });
    return ofConfig(root, createProjectChecker({ root }).check().problems).map((p) => p.message);
  }

  it('each id is looked for in the .fud, the browser modules, the sheets of styles and the guide', () => {
    expect(allowing(['state', 'popover', 'field-sizing', 'anchor-positioning', 'search'])).toEqual([
      '"search" in "allow" is not used by anything in this project (hint by default; warning in this project)',
    ]);
  });

  it('a guide whose sheet is not there reads as empty', () => {
    const root = project({
      'fudic.json': JSON.stringify({ id: 'app', baseline: { allow: ['state'] }, guide: { sheet: 'nada.css' }, diagnostics: { FUD1528: 'warning' } }),
    });
    expect(ofConfig(root, createProjectChecker({ root }).check().problems).map((p) => p.code)).toEqual(['FUD1528']);
  });
});

describe('projectBaselineDiagnostics on its own', () => {
  const config = (text: object): ProjectConfig =>
    readProjectConfig('/p', { exists: () => true, read: () => JSON.stringify(text) }).config!;

  it('reads each library once, whatever asks; a key the table lacks uses nothing', () => {
    let reads = 0;
    const library = {
      name: '@acme/ui',
      uses: () => {
        reads++;
        return [{ name: 'field-sizing', key: 'css.properties.field-sizing', span: { start: 0, end: 1 } }];
      },
    };
    const found = projectBaselineDiagnostics(
      config({ id: 'app', baseline: { allow: ['state'] } }),
      () => [{ name: 'x', key: 'css.properties.nope', span: { start: 0, end: 1 } }],
      [library],
    );
    expect(reads).toBe(1);
    expect(found.map((d) => d.code)).toEqual(['FUD1526', 'FUD1528']);
  });

  it('judges on the date it is given (criterion 17), and an id written with escapes has no span', () => {
    const uses = () => [{ name: 'field-sizing', key: 'css.properties.field-sizing', span: { start: 0, end: 1 } }];
    const library = { name: '@acme/ui', uses };
    expect(projectBaselineDiagnostics(config({ id: 'app', baseline: 'newly' }), uses, [library], '2026-10-27')).toEqual([]);
    expect(projectBaselineDiagnostics(config({ id: 'app', baseline: 'newly' }), uses, [library], '2024-01-01')).toHaveLength(1);
    const escaped = readProjectConfig('/p', {
      exists: () => true,
      read: () => '{"id":"app","baseline":{"allow":["st\\u0061te"]}}',
    }).config!;
    const [unused] = projectBaselineDiagnostics(escaped, () => [], []);
    expect(unused).toMatchObject({ code: 'FUD1528', file: 'fudic.json' });
    expect(unused!.span).toBeUndefined();
  });

  it('a package with no fudic.json is read by the conventions, with no sheets', () => {
    const root = project({
      'src/browser/menu.ts': `export function open(el: HTMLElement): void {\n  el.showPopover();\n}\n`,
    });
    const file = `${root}/src/browser/menu.ts`;
    const program = ts.createProgram([file], { lib: ['lib.es2024.d.ts', 'lib.dom.d.ts'], strict: true });
    const uses = packageBaselineUses({ typescript: ts, program, readFile: () => undefined }, { root, config: null, fuds: [] });
    expect(uses.map((use) => use.key)).toEqual(['api.HTMLElement.showPopover']);
  });
});
