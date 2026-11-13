/**
 * SDD-84 §4.6, criterion 31 — `FUD1555`: a string handed to a sink Trusted Types guards, in the code
 * that runs in the browser, while `page.headers` requires trusted types. By type and not by name,
 * through the project checker over a real project on disk, as the build and `fudic check` run it.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type ts from 'typescript';
import ts6 from 'typescript-6';
import { HEADERS_TEMPLATES } from '@fudic/config';
import {
  createProjectChecker,
  fudTrustedTypesDiagnostics,
  moduleTrustedTypesDiagnostics,
  parseSource,
  projectParsed,
  requiresTrustedTypes,
  toPosix,
  type CheckReport,
} from '../src/index.js';
import { indexOf } from './_support.js';

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
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-trusted-')));
  for (const [relative, text] of Object.entries({ 'tsconfig.json': TSCONFIG, ...files })) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

function component(name: string, code: string): string {
  return `@code {\n${code}\n}\n<app-${name}>\n  <template shadowrootmode="open"><p>x</p></template>\n</app-${name}>\n`;
}

/** Every sink of §4.6, once with a string and once with something that is not one. */
const SINKS = `interface TrustedHTML { readonly brand: 'trusted' }
declare const trusted: TrustedHTML;
declare const text: string;
declare const maybe: string | undefined;
declare const loose: any;
const el = document.createElement('div');
const script = document.createElement('script');
const frame = document.createElement('iframe');
el.innerHTML = text;
el.innerHTML = trusted as unknown as string;
el.innerHTML = trusted as unknown as string & TrustedHTML;
el.outerHTML = \`<p>\${text}</p>\`;
el.innerHTML += '<br>';
frame.srcdoc = maybe ?? '';
script.src = text;
script.text = 'go()';
el.textContent = text;
el.insertAdjacentHTML('beforeend', text);
el.insertAdjacentHTML('beforeend', loose);
document.write('<p>', text);
document.writeln(loose);
document.writeln(maybe);
el.setHTMLUnsafe(text);
document.createRange().createContextualFragment(text);
new DOMParser().parseFromString(text, 'text/html');
eval(text);
setTimeout(text, 1);
setTimeout(() => {}, 1);
setInterval(text);
new Function('a', text);
Function(...[text]);
el['innerHTML'] = text;
const mine = { innerHTML: '', insertAdjacentHTML(_: string, __: string): void {} };
mine.innerHTML = text;
mine.insertAdjacentHTML('x', text);
el.title = text;
(() => text)();
export { el };`;

const FILES = {
  'fudic.json': JSON.stringify({ id: 't' }),
  'src/browser/sinks.ts': SINKS,
  'src/components/app-a.fud': component('a', "const box = document.createElement('div');\nbox.innerHTML = String(1);"),
  // The declaration of `props<…>()` is rewritten whole: what it holds has no node in the program.
  'src/components/app-d.fud': component(
    'd',
    "const { box } = props<{ box: HTMLScriptElement }>(), late = (box.innerHTML = 'x'), later = (box.text = 'y');\nprops<{ s: HTMLScriptElement }>().s.text = 'y';",
  ),
  'src/server/s.ts': "export function s(el: Element): void { el.innerHTML = 'x'; }\n",
};

const check = (files: Readonly<Record<string, string>>) => {
  const root = project(files);
  const checker = createProjectChecker({ root, typescript: ts6 as unknown as typeof ts });
  return { root, checker, report: checker.check() };
};

const { root: ROOT, report, checker: CHECKER } = check(FILES);

/** The `FUD1555` the check reports on `relative`, as the text under each. */
function warned(relative: string, over: CheckReport = report, root = ROOT, files: Readonly<Record<string, string>> = FILES): readonly string[] {
  const source = files[relative as keyof typeof files]!;
  return over.problems
    .filter((p) => p.file === `${root}/${relative}` && p.code === 'FUD1555')
    .map((p) => source.slice(p.span.start, p.span.end));
}

describe('FUD1555 — strings into the sinks (criterion 31)', () => {
  it('each sink with a string warns, on the assignment or the call; what is not a string, or not the browser’s, does not', () => {
    expect(warned('src/browser/sinks.ts')).toEqual([
      'el.innerHTML = text',
      'el.outerHTML = `<p>${text}</p>`',
      "el.innerHTML += '<br>'",
      "frame.srcdoc = maybe ?? ''",
      'script.src = text',
      "script.text = 'go()'",
      "el.insertAdjacentHTML('beforeend', text)",
      "document.write('<p>', text)",
      'document.writeln(maybe)',
      'el.setHTMLUnsafe(text)',
      'document.createRange().createContextualFragment(text)',
      "new DOMParser().parseFromString(text, 'text/html')",
      'eval(text)',
      'setTimeout(text, 1)',
      'setInterval(text)',
      "new Function('a', text)",
    ]);
  });

  it('the message names the sink', () => {
    const first = report.problems.find((p) => p.code === 'FUD1555')!;
    expect(first.message).toContain('innerHTML');
    expect(first.severity).toBe('warning');
  });

  it('in the @code of a .fud too; a declaration the projection rewrites says nothing, a call that holds the receiver does', () => {
    expect(warned('src/components/app-a.fud')).toEqual(['box.innerHTML = String(1)']);
    expect(warned('src/components/app-d.fud')).toEqual(["props<{ s: HTMLScriptElement }>().s.text = 'y'"]);
  });

  it('src/server runs in Node and is not looked at', () => {
    expect(warned('src/server/s.ts')).toEqual([]);
  });

  it('without `require-trusted-types-for` in page.headers, nothing', () => {
    const files = { ...FILES, 'page.headers': "Content-Security-Policy:\n  default-src 'self'\n" };
    const { root, report: quiet } = check(files);
    expect(warned('src/browser/sinks.ts', quiet, root, files)).toEqual([]);
  });

  it('in a library, nothing: its headers apply to nothing', () => {
    const files = { ...FILES, 'fudic.json': JSON.stringify({ id: 't', kind: 'lib' }) };
    const { root, report: lib } = check(files);
    expect(warned('src/browser/sinks.ts', lib, root, files)).toEqual([]);
  });

  it('a fud-disable silences it, as any warning', () => {
    const files = { ...FILES, 'src/browser/sinks.ts': SINKS.replace('eval(text);', '// fud-disable-next-line FUD1555: trusted input\neval(text);') };
    const { root, report: silenced } = check(files);
    expect(warned('src/browser/sinks.ts', silenced, root, files)).not.toContain('eval(text)');
  });
});

describe('requiresTrustedTypes', () => {
  const read = (files: Readonly<Record<string, string>>) => (path: string) => files[path];

  it('reads the CSP of page.headers, or of its template when there is none', () => {
    const app = { root: '/a', config: { kind: 'app' as const } };
    expect(requiresTrustedTypes(app, read({}))).toBe(HEADERS_TEMPLATES.page.includes('require-trusted-types-for'));
    expect(requiresTrustedTypes(app, read({ '/a/page.headers': 'Referrer-Policy: no-referrer\n' }))).toBe(false);
    expect(
      requiresTrustedTypes(app, read({ '/a/page.headers': "Content-Security-Policy:\n  default-src 'self'\n  REQUIRE-TRUSTED-TYPES-FOR 'script'\n" })),
    ).toBe(true);
  });

  it('no project, or a library, requires nothing; a project without a usable fudic.json is an app', () => {
    expect(requiresTrustedTypes(null, read({}))).toBe(false);
    expect(requiresTrustedTypes({ root: '/a', config: { kind: 'lib' } }, read({}))).toBe(false);
    expect(requiresTrustedTypes({ root: '/a', config: null }, read({}))).toBe(true);
  });

  it('a file the program does not have reads as nothing', () => {
    const program = CHECKER.languageService()!.getProgram()!;
    expect(moduleTrustedTypesDiagnostics(program, '/nowhere/x.ts')).toEqual([]);
    const elsewhere = projectParsed('/nowhere/app-z.fud', parseSource(FILES['src/components/app-a.fud']), indexOf({}));
    expect(fudTrustedTypesDiagnostics(program, elsewhere)).toEqual([]);
  });

  it('a project with no fudic.json at all is not asked', () => {
    const files = { 'src/browser/sinks.ts': SINKS };
    const { root, report: bare } = check(files);
    expect(warned('src/browser/sinks.ts', bare, root, files)).toEqual([]);
  });
});
