/**
 * SDD-59 §6.6 — what the editor offers inside a term: TypeScript's own language service, the one
 * VS Code runs on a `.js` file, over a project with `@fudic/terms` installed as a user has it
 * (its `dist`, linked into `node_modules`). `ctx.` completes the stock ctx, `ctx.locate(x).` the
 * Playwright `Locator`, and with the type `fudic g term` writes next to a `fudic/bench.js`, what
 * that extension adds.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PACKAGE = fileURLToPath(new URL('..', import.meta.url));

/** The `@type` of `run` as `fudic g term` writes it, without and with `fudic/bench.js` (§4.8). */
const STOCK_TYPE = "/** @type {import('@fudic/terms').Term<string>['run']} */";
const SHORT_TYPE = "/** @type {import('@fudic/terms').Term['run']} */";
const BENCH_TYPE =
  "/** @type {import('@fudic/terms').Term<string, import('@fudic/terms').ContextOf<typeof import('../../bench.js').default>>['run']} */";

/** The extension of §3.3. */
const BENCH_JS = `import { defineExtension } from '@fudic/terms';

export default defineExtension({
  async setup(page) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.route('**/api/**', (route) => route.fulfill({ json: [] }));
  },
  context: (ctx) => ({
    ...ctx,
    async openMenu(ref) {
      const el = ctx.locate(ref);
      await ctx.act(el, () => el.press('Enter'));
    },
  }),
});
`;

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fudic-terms-editor-'));
  mkdirSync(join(root, 'node_modules', '@fudic'), { recursive: true });
  symlinkSync(PACKAGE, join(root, 'node_modules', '@fudic', 'terms'), 'junction');
  mkdirSync(join(root, 'fudic', 'terms', 'when'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{ "name": "app", "private": true, "type": "module" }');
  writeFileSync(join(root, 'fudic', 'bench.js'), BENCH_JS);
});

afterAll(() => {
  // The link goes as a link: the package it points at stays.
  rmSync(root, { recursive: true, force: true });
});

/** A language service over the project, as an editor holds one for a `.js` file with `checkJs`. */
function service(file: string, text: string): ts.LanguageService {
  const files = new Map([[file, text]]);
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: [],
  };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [file],
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const content = files.get(name) ?? (existsSync(name) ? readFileSync(name, 'utf8') : undefined);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (name) => files.has(name) || ts.sys.fileExists(name),
    readFile: (name) => files.get(name) ?? ts.sys.readFile(name),
    readDirectory: (...args) => ts.sys.readDirectory(...args),
    directoryExists: (name) => ts.sys.directoryExists(name),
    getDirectories: (name) => ts.sys.getDirectories(name),
    realpath: (name) => ts.sys.realpath!(name),
  };
  return ts.createLanguageService(host);
}

/** What the editor offers at the `|` of a term module: the names of the completions. */
function completions(type: string, body: string): string[] {
  const file = join(root, 'fudic', 'terms', 'when', 'probe.js').replace(/\\/gu, '/');
  const marked =
    "export const meta = { name: 'probe', block: 'when', params: [{ name: 'target', type: 'element' }] };\n\n" +
    `${type}\nexport async function run(ctx, { target }) {\n  ${body}\n  return { pass: true, evidence: null };\n}\n`;
  const offset = marked.indexOf('|');
  const text = marked.replace('|', '');
  const found = service(file, text).getCompletionsAtPosition(file, offset, {});
  return (found?.entries ?? []).map((entry) => entry.name);
}

/** The semantic errors of a term module: none, when its types are right. */
function errors(type: string, body: string): string[] {
  const file = join(root, 'fudic', 'terms', 'when', 'probe.js').replace(/\\/gu, '/');
  const text =
    "export const meta = { name: 'probe', block: 'when', params: [{ name: 'target', type: 'element' }] };\n\n" +
    `${type}\nexport async function run(ctx, { target }) {\n  ${body}\n  return { pass: true, evidence: null };\n}\n`;
  return service(file, text)
    .getSemanticDiagnostics(file)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

// A language service loads the whole lib and Playwright's types: seconds, the first time.
describe('§6.6 — the editor completes ctx in a term', { timeout: 30_000 }, () => {
  it.each([
    ['Term[\'run\']', SHORT_TYPE],
    ['Term<string>[\'run\'], as g term writes it', STOCK_TYPE],
  ])('with %s, ctx. offers page, locate, act and text', (_name, type) => {
    expect(completions(type, 'ctx.|')).toEqual(expect.arrayContaining(['page', 'locate', 'act', 'text']));
  });

  it('ctx.locate(x). offers the Playwright Locator', () => {
    expect(completions(STOCK_TYPE, 'ctx.locate(String(target)).|')).toEqual(
      expect.arrayContaining(['click', 'press', 'getAttribute', 'evaluate', 'isVisible', 'focus']),
    );
  });

  it('ctx.page. offers the Playwright Page: keyboard, mouse, evaluate', () => {
    expect(completions(STOCK_TYPE, 'ctx.page.|')).toEqual(expect.arrayContaining(['keyboard', 'mouse', 'evaluate']));
  });

  it('the stock ctx has no openMenu: using it is an error', () => {
    expect(completions(STOCK_TYPE, 'ctx.|')).not.toContain('openMenu');
    expect(errors(STOCK_TYPE, 'await ctx.openMenu(String(target));').join('\n')).toContain("'openMenu'");
  });

  it('with the type of a fudic/bench.js, ctx. offers what it adds too, and using it is no error', () => {
    expect(completions(BENCH_TYPE, 'ctx.|')).toEqual(expect.arrayContaining(['page', 'locate', 'act', 'text', 'openMenu']));
    expect(errors(BENCH_TYPE, 'await ctx.openMenu(String(target));')).toEqual([]);
  });
});
