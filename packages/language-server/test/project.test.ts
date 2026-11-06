/**
 * SDD-77 §3.5 and §8.2.19–20 — `@fudic/language-server/project`: the editor's repairs without an
 * editor. What it offers for a problem of the project check is what the light bulb offers.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectChecker, nodeFileSystem, toPosix, type CheckProblem } from '@fudic/typecheck';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import { openProject } from '../src/project.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
  include: ['src/**/*.fud'],
});

const BADGE = '<app-badge>\n  <template shadowrootmode="open"><span>x</span></template>\n</app-badge>\n';

const PAGE = '<!DOCTYPE html>\n<html>\n<head><title>t</title></head>\n<body>\n  <app-badge></app-badge>\n</body>\n</html>\n';

const LIST = (header: string, type = 'readonly Item[]'): string =>
  `@code {\n  type Item = { readonly id: number; readonly name: string };\n  const { items = [] } = props<{ items?: ${type} }>();\n}\n\n<app-list>\n  <template shadowrootmode="open">\n    <ul>\n      @foreach (${header} of items) {\n        <li>x</li>\n      }\n    </ul>\n  </template>\n</app-list>\n`;

let roots: string[] = [];

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-ls-project-')));
  roots.push(root);
  write(root, { 'tsconfig.json': TSCONFIG, ...files });
  return root;
}

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    writeFileSync(join(root, relative), text);
  }
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

/** The problems the project check finds with that code. */
function problems(root: string, code: string): readonly Found[] {
  return createProjectChecker({ root }).check().problems.filter((p) => p.code === code).map(asFud);
}

/** A problem of the check as the diagnostic it is: its code is a fudic one, as the MCP reads it. */
type Found = SourceDiagnostic & { readonly file: string };
const asFud = (problem: CheckProblem): Found => problem as Found;

describe('openProject — repairs', () => {
  it('FUD0191: the link the light bulb inserts, for a tag the project has', () => {
    const root = project({ 'src/components/app-badge.fud': BADGE, 'src/routes/index.fud': PAGE });
    const [problem] = problems(root, 'FUD0191');
    const repairs = openProject(root).repairs(problem!.file, problem!);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]!.title).toBe('Add <link rel="component"> for <app-badge>');
    expect(repairs[0]!.edits.map((e) => e.newText).join('')).toContain('<link rel="component" href="../components/app-badge.fud">');
  });

  it('FUD0540 with a destructured id: the key, with no TypeScript to ask', () => {
    const root = project({ 'src/components/app-list.fud': LIST('const { id }') });
    const [problem] = problems(root, 'FUD0540');
    const repairs = openProject(root).repairs(problem!.file, problem!);
    expect(repairs.map((r) => r.title)).toEqual(['Add key (id)']);
  });

  it('FUD0540 on an element: only with the check\'s TypeScript, which knows its type has an id', () => {
    const root = project({ 'src/components/app-list.fud': LIST('const item') });
    const checker = createProjectChecker({ root });
    const problem = asFud(checker.check().problems.find((p) => p.code === 'FUD0540')!);
    expect(openProject(root).repairs(problem.file, problem)).toEqual([]);
    expect(openProject(root, { typescript: () => undefined }).repairs(problem.file, problem)).toEqual([]);
    const typed = openProject(root, { typescript: () => checker.languageService() });
    expect(typed.repairs(problem.file, problem).map((r) => r.title)).toEqual(['Add key (item.id)']);
  });

  it('FUD0540 over an object without id: nothing to offer', () => {
    const root = project({ 'src/components/app-list.fud': LIST('const item', 'readonly { readonly name: string }[]') });
    const checker = createProjectChecker({ root });
    const problem = asFud(checker.check().problems.find((p) => p.code === 'FUD0540')!);
    expect(openProject(root, { typescript: () => checker.languageService() }).repairs(problem.file, problem)).toEqual([]);
  });

  it('nothing for a file that is not a .fud, or that cannot be read', () => {
    const root = project({ 'src/components/app-badge.fud': BADGE, 'src/a.fudspec': 'component app-badge\n' });
    const service = openProject(root);
    const problem = { code: 'FUD0191', severity: 'error', message: 'x', span: { start: 0, end: 1 } } as const;
    expect(service.repairs(`${root}/src/a.fudspec`, problem)).toEqual([]);
    expect(service.repairs(`${root}/src/gone.fud`, problem)).toEqual([]);
  });

  it('a file read again with the same text is the same document; a new text is read anew', () => {
    const root = project({ 'src/components/app-badge.fud': BADGE, 'src/routes/index.fud': PAGE });
    const service = openProject(root);
    const [problem] = problems(root, 'FUD0191');
    const first = service.repairs(problem!.file, problem!);
    expect(service.repairs(problem!.file, problem!)).toEqual(first);
    // The same tag one line lower: the repair follows the text on disk.
    write(root, { 'src/routes/index.fud': PAGE.replace('<body>\n', '<body>\n  <p>first</p>\n') });
    const [moved] = problems(root, 'FUD0191');
    expect(service.repairs(moved!.file, moved!)).toHaveLength(1);
  });

  it('the disk it is handed is the one it reads', () => {
    const root = project({ 'src/components/app-badge.fud': BADGE, 'src/routes/index.fud': PAGE });
    const [problem] = problems(root, 'FUD0191');
    const real = nodeFileSystem();
    const read: string[] = [];
    const fs = { ...real, readFile: (path: string) => (read.push(path), real.readFile(path)) };
    expect(openProject(root, { fs }).repairs(problem!.file, problem!)).toHaveLength(1);
    expect(read).toContain(toPosix(problem!.file));
  });
});

describe('openProject — the style guide (SDD-79 §4.9)', () => {
  const GUIDE = {
    'fudic.json': JSON.stringify({ kind: 'app', id: 'p', guide: { sheet: 'src/guide.css' } }),
    'src/guide.css': '@import "./h1.css";',
    'src/h1.css': ':where(h1) { margin: 0; }',
  };
  const HEAD = '<app-head>\n  <template shadowrootmode="open"><h1>t</h1></template>\n</app-head>\n';
  const at = HEAD.indexOf('h1>');
  const missing: SourceDiagnostic = { code: 'FUD1440', severity: 'warning', message: 'm', span: { start: at, end: at + 2 } };

  it('FUD1440: adds the piece, as the light bulb does', () => {
    const root = project({ ...GUIDE, 'src/components/app-head.fud': HEAD });
    const [repair] = openProject(root).repairs(`${root}/src/components/app-head.fud`, missing);
    expect(repair?.edits[0]?.newText).toBe(' shadowrootadoptedstylesheets="h1"');
  });

  it('reads the guide again when its fudic.json or a sheet changes', () => {
    const root = project({ ...GUIDE, 'src/components/app-head.fud': HEAD });
    const service = openProject(root);
    const file = `${root}/src/components/app-head.fud`;
    expect(service.repairs(file, missing)).toHaveLength(1);
    write(root, { 'src/guide.css': '' });
    service.invalidate(`${root}/src/guide.css`);
    expect(service.repairs(file, missing)).toEqual([]);
    write(root, { 'src/guide.css': '@import "./h1.css";', 'fudic.json': JSON.stringify({ kind: 'app', id: 'p' }) });
    service.invalidate(`${root}/fudic.json`);
    expect(service.repairs(file, missing)).toEqual([]);
  });
});

describe('openProject — invalidate', () => {
  it('before the first question there is nothing to forget', () => {
    const root = project({});
    expect(() => openProject(root).invalidate(`${root}/src/x.fud`)).not.toThrow();
  });

  it('a component written later is a tag the next repair knows', () => {
    const root = project({ 'src/routes/index.fud': PAGE, 'src/components/app-other.fud': BADGE.replaceAll('app-badge', 'app-other') });
    const service = openProject(root);
    // Asked once, before the component existed: the index is read then, without it.
    expect(service.repairs(`${root}/src/components/app-other.fud`, { code: 'FUD0191', severity: 'error', message: 'x', span: { start: 0, end: 1 } })).toEqual([]);
    write(root, { 'src/components/app-badge.fud': BADGE });
    const [problem] = problems(root, 'FUD0191');
    expect(service.repairs(problem!.file, problem!)).toEqual([]);
    service.invalidate(`${root}/src/components/app-badge.fud`);
    expect(service.repairs(problem!.file, problem!)).toHaveLength(1);
  });

  it('a .fudapi or any other file is taken in without harm', () => {
    const root = project({ 'src/components/app-badge.fud': BADGE, 'src/routes/index.fud': PAGE });
    const service = openProject(root);
    const [problem] = problems(root, 'FUD0191');
    service.repairs(problem!.file, problem!);
    service.invalidate(`${root}/src/routes/index.fudapi`);
    service.invalidate(`${root}\\src\\styles.css`);
    expect(service.repairs(problem!.file, problem!)).toHaveLength(1);
  });
});
