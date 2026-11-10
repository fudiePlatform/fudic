/**
 * The repairs without an editor (SDD-62 §3.3, §4.3, §4.4; criteria 7–10).
 *
 * `repairsFor` is asked in process — a parsed file, the workspace index and, where a type
 * matters, a real TypeScript over the projection — with no server started. What it answers is
 * held to what the editor's bulb offers for the same diagnostic, and every repair that is offered
 * is applied and the file checked again: a bulb that trades one error for another is a defect.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import ts from 'typescript';
import { URI } from 'vscode-uri';
import { span, type GuidePiece } from '@fudic/compiler';
import { FUD0056, FUD1160, type SourceDiagnostic } from '@fudic/diagnostics';
import { clientFileName, GLOBALS_DTS } from '@fudic/language-core';
import { fudicDiagnostics, portableTypeDiagnostics } from '@fudic/typecheck';
import { DocumentCache, type CachedDocument } from '../src/document-cache.js';
import { ProjectConfigs } from '../src/project-config.js';
import { REPAIRED_CODES, repairsFor, type Repair } from '../src/repairs.js';
import { RequestStats } from '../src/stats.js';
import { createFudicService, placedDiagnostics } from '../src/services/plugin.js';
import { guidePieceDiagnostics } from '../src/services/template-attrs.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from './_lsp.js';
import { component, LAYOUT, memoryFs } from './_support.js';

const ROUTE = '/p/blog/x.fud';
const LIST = '/p/components/fix-list.fud';

const FRAME_LAYOUT = `<!DOCTYPE html>
<html lang="en">
  <head>
    @RenderHead()
  </head>
  <body>
    @RenderSection(top, required: true)
    @RenderSection(bottom, required: true)
    <main>@RenderBody()</main>
  </body>
</html>
`;

const UI = `@snippet card(title: string, tone: "a" | "b" = "a") {
  <p>@title</p>
}
`;

// The project's style guide (SDD-79): one piece, `h1`, which a component may adopt.
const GUIDE_FILES: Readonly<Record<string, string>> = {
  '/p/fudic.json': JSON.stringify({ kind: 'app', id: 'p', guide: { sheet: 'guide.css' } }),
  '/p/guide.css': '@import "./h1.css";',
  '/p/h1.css': ':where(h1) { margin: 0; }',
};

const FILES: Readonly<Record<string, string>> = {
  '/p/components/app-badge.fud': component('app-badge'),
  ...GUIDE_FILES,
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/layouts/_frame.fud': FRAME_LAYOUT,
  '/p/snippets/ui.fud': UI,
  // A contract with a form of files (SDD-81), for the file inputs bound to it.
  '/p/src/components/up-load.fudapi': 'put save\n  form upForm\n\nform upForm\n  avatar  file?\n  docs  file[]\n  name  str\n',
};

/** A component whose form binds `controls` (SDD-81). */
const upload = (controls: string): string => `<link rel="server" href="./up-load.fudapi">
<up-load>
  <template shadowrootmode="open">
    <form control=@upForm form:=@save>
      ${controls}
    </form>
  </template>
</up-load>
`;
const UPLOAD = '/p/src/components/up-load.fud';

/**
 * A TypeScript over one projection, as the server's: the projection and the globals in memory,
 * the standard library from disk. Without the library an array is `{}` and no element has a type.
 */
function projectionService(path: string, text: string): ts.LanguageService {
  const files: Record<string, string> = { [path]: text, '/p/fudic-globals.d.ts': GLOBALS_DTS };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: () => '1',
    getScriptSnapshot: (name) => {
      const found = files[name] ?? ts.sys.readFile(name);
      return found === undefined ? undefined : ts.ScriptSnapshot.fromString(found);
    },
    getScriptKind: () => ts.ScriptKind.TS,
    getCurrentDirectory: () => '/p',
    getCompilationSettings: () => ({ strict: true, target: ts.ScriptTarget.ES2022, allowNonTsExtensions: true }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: (name) => name in files || ts.sys.fileExists(name),
    readFile: (name) => files[name] ?? ts.sys.readFile(name),
  };
  return ts.createLanguageService(host);
}

interface Setup {
  readonly cached: CachedDocument;
  readonly index: WorkspaceIndex;
  readonly typescript: ts.LanguageService | undefined;
  readonly diagnostics: readonly SourceDiagnostic[];
  readonly pieces: readonly GuidePiece[];
}

/** `source` at `path`, parsed against the workspace; with `typed`, a real TypeScript over its projection. */
function setup(source: string, path = ROUTE, typed = false): Setup {
  const fs = memoryFs({ ...FILES, [path]: source });
  const index = new WorkspaceIndex(fs);
  index.scan('/p');
  const cached = new DocumentCache(index).get(path, 1, source);
  const client = cached.virtuals.find((v) => v.fileName === clientFileName(cached.path));
  const typescript = typed && client !== undefined ? projectionService(cached.path, client.text) : undefined;
  // The guide's two warnings, as the editor adds them to the file's own.
  const pieces = new ProjectConfigs(fs).guidePiecesFor(path);
  const diagnostics = [...placedDiagnostics(path, fudicDiagnostics(cached, index)), ...guidePieceDiagnostics(cached, pieces)];
  return { cached, index, typescript, diagnostics, pieces };
}

const inputOf = ({ cached, index, typescript, pieces }: Setup) => ({
  cached,
  index,
  pieces,
  ...(typescript === undefined ? {} : { typescript }),
});

/** Every repair `repairsFor` gives for the diagnostics of `code` in the file. */
function repairs(s: Setup, code: string): Repair[] {
  return s.diagnostics.filter((d) => d.code === code).flatMap((d) => [...repairsFor(inputOf(s), d)]);
}

/** `source` with the repair's edits applied, last first so the offsets hold. */
function applied(source: string, repair: Repair): string {
  return [...repair.edits]
    .sort((a, b) => b.span.start - a.span.start)
    .reduce((text, e) => text.slice(0, e.span.start) + e.newText + text.slice(e.span.end), source);
}

/** What is left in a file: fudic's diagnostics, the portable view's and, when typed, TypeScript's. */
function remaining(source: string, path: string, typed: boolean): string[] {
  const s = setup(source, path, typed);
  const program = s.typescript?.getProgram();
  const tsErrors =
    s.typescript === undefined
      ? []
      : [...s.typescript.getSyntacticDiagnostics(path), ...s.typescript.getSemanticDiagnostics(path)].map(
          (d) => `TS${d.code}`,
        );
  const view = program === undefined ? [] : portableTypeDiagnostics(program, s.cached);
  return [...s.diagnostics, ...view].map((d) => `${d.code} ${d.message}`).concat(tsErrors);
}

/** A component that loops over `items`, typed `type`, with `header` as the loop's header. */
const list = (type: string, header: string, row = '<li>x</li>'): string => `@code {
  ${type}
  const items: Items = [];
}

<fix-list>
  <template shadowrootmode="open">
    <ul>
      @foreach (${header}) {
        ${row}
      }
    </ul>
  </template>
</fix-list>
`;

describe('FUD0540 — the key a bulb writes is the one the element allows (criterion 7)', () => {
  const ITEM = 'type Item = { id: string; name: string }; type Items = Item[];';

  it.each([
    ['an Item with id: string', ITEM, 'const item of items', 'key (item.id)'],
    ['an Item with id: number', 'type Item = { id: number }; type Items = Item[];', 'const item of items', 'key (item.id)'],
    ['an Item with a literal union id', "type Item = { id: 'a' | 'b' }; type Items = Item[];", 'const item of items', 'key (item.id)'],
    ['a string[]', 'type Items = string[];', 'const item of items', 'key (item)'],
    ['a number[]', 'type Items = number[];', 'const n of items', 'key (n)'],
    ['a ("a" | "b")[]', "type Items = ('a' | 'b')[];", 'const item of items', 'key (item)'],
    ['a (1 | 2)[]', 'type Items = (1 | 2)[];', 'const item of items', 'key (item)'],
    ['a destructured id', ITEM, 'const { id, name } of items', 'key (id)'],
  ])('%s: writes %s… and the file is left clean', (_label, type, header, key) => {
    const source = list(type, header);
    const s = setup(source, LIST, true);
    const got = repairs(s, 'FUD0540');

    expect(got.map((r) => r.title)).toEqual([`Add ${key}`]);
    expect(got[0]!.edits.map((e) => e.newText)).toEqual([` ${key}`]);
    // Between the header and the `{`.
    expect(applied(source, got[0]!)).toContain(`@foreach (${header}) ${key} {`);
    expect(remaining(applied(source, got[0]!), LIST, true)).toEqual([]);
  });

  it.each([
    ['an Item with no id', 'type Item = { name: string }; type Items = Item[];'],
    ['an Item whose id is optional', 'type Item = { id?: string }; type Items = Item[];'],
    ['an Item whose id is an object', 'type Item = { id: { n: number } }; type Items = Item[];'],
    ['a boolean[]', 'type Items = boolean[];'],
    // Neither a string nor a number, and the view cannot port it: a key there adds FUD1153.
    ['a (string | number)[]', 'type Items = (string | number)[];'],
    ['a (string | boolean)[]', 'type Items = (string | boolean)[];'],
  ])('%s: offers no key, which is the author’s choice', (_label, type) => {
    const s = setup(list(type, 'const item of items'), LIST, true);

    expect(s.diagnostics.map((d) => d.code)).toContain('FUD0540');
    expect(repairs(s, 'FUD0540')).toEqual([]);
  });

  it('with no TypeScript, keys only a destructured id', () => {
    const ITEMS = 'type Item = { id: string }; type Items = Item[];';
    expect(repairs(setup(list(ITEMS, 'const item of items'), LIST), 'FUD0540')).toEqual([]);
    expect(repairs(setup(list(ITEMS, 'const { id } of items'), LIST), 'FUD0540').map((r) => r.title)).toEqual([
      'Add key (id)',
    ]);
  });

  it('keys a counting @for by its counter, and offers nothing for @for (;;) or @while', () => {
    const loop = (header: string): string => `@code {
  let n = 0;
}

<fix-list>
  <template shadowrootmode="open">
    ${header} {
      <p>x</p>
    }
  </template>
</fix-list>
`;
    const counting = setup(loop('@for (let i = 0; i < 3; i++)'), LIST, true);
    expect(repairs(counting, 'FUD0540').map((r) => r.title)).toEqual(['Add key (i)']);

    for (const header of ['@for (;;)', '@while (n < 3)']) {
      const s = setup(loop(header), LIST, true);
      expect(s.diagnostics.map((d) => d.code), header).toContain('FUD0540');
      expect(repairs(s, 'FUD0540'), header).toEqual([]);
    }
  });

  it('offers nothing when the projection has no source for the file', () => {
    const s = setup(list('type Items = string[];', 'const item of items'), LIST, true);
    // A TypeScript over another file: the program has no source for this one.
    const elsewhere = projectionService('/p/other.ts', 'export {};');
    const input = { cached: s.cached, index: s.index, typescript: elsewhere };
    const diagnostic = s.diagnostics.find((d) => d.code === 'FUD0540')!;

    expect(repairsFor(input, diagnostic)).toEqual([]);
  });
});

describe('FUD0056 — no quotes around a value in braces (criterion 8)', () => {
  const page = (markup: string): string => `<link rel="layout" href="../layouts/_layout.fud">\n${markup}\n`;

  it('<button onClick={f}> gets no bulb that quotes it', () => {
    const s = setup(page('<button onClick={f}>Go</button>'));

    expect(s.diagnostics.map((d) => d.code)).not.toContain('FUD0056');
    for (const d of s.diagnostics) {
      expect(repairsFor(inputOf(s), d).filter((r) => r.title === 'Quote the value'), d.code).toEqual([]);
    }
  });

  it('declines a FUD0056 whose value opens with `{`, whoever reports it', () => {
    const source = page('<div title={f}></div>');
    const s = setup(source);
    const at = source.indexOf('{f}');

    expect(repairsFor(inputOf(s), FUD0056({ span: span(at, at + 3) }))).toEqual([]);
  });

  it('still quotes a plain unquoted value, and the file is left clean', () => {
    const source = page('<div title=hello></div>');
    const got = repairs(setup(source), 'FUD0056');

    expect(got.map((r) => r.title)).toEqual(['Quote the value']);
    expect(remaining(applied(source, got[0]!), ROUTE, false)).toEqual([]);
  });
});

describe('FUD1160 — React’s names become HTML’s', () => {
  const page = (markup: string): string => `<link rel="layout" href="../layouts/_layout.fud">\n${markup}\n`;

  it.each([
    ['<div className="card"></div>', 'class', '<div class="card"></div>'],
    ['<label htmlFor="email">E</label><input id="email">', 'for', '<label for="email">E</label><input id="email">'],
  ])('%s → %s, and the file is left clean', (markup, html, expected) => {
    const source = page(markup);
    const got = repairs(setup(source), 'FUD1160');

    expect(got.map((r) => r.title)).toEqual([`Change to ${html}`]);
    expect(applied(source, got[0]!)).toBe(page(expected));
    expect(remaining(applied(source, got[0]!), ROUTE, false)).toEqual([]);
  });

  it('reads the name in any case', () => {
    const source = page('<div CLASSNAME="card"></div>');
    const at = source.indexOf('CLASSNAME');
    const s = setup(source);

    const got = repairsFor(inputOf(s), FUD1160({ span: span(at, at + 9), name: 'CLASSNAME', html: 'class' }));
    expect(got.map((r) => [r.title, r.edits[0]!.newText])).toEqual([['Change to class', 'class']]);
  });
});

describe('repairsFor answers what the editor offers, with no server (criterion 9)', () => {
  const layout = '<link rel="layout" href="../layouts/_layout.fud">\n';
  const frame = '<link rel="layout" href="../layouts/_frame.fud">\n';

  /** One sample per repaired code, and the file it is checked in. */
  const SAMPLES: Readonly<Record<string, { readonly source: string; readonly path?: string; readonly typed?: boolean }>> = {
    FUD0056: { source: `${layout}<div title=hello></div>\n` },
    FUD0191: { source: `${layout}<app-badge></app-badge>\n` },
    FUD0540: { source: list('type Items = string[];', 'const item of items'), path: LIST, typed: true },
    FUD0890: { source: `${frame}<p>x</p>\n` },
    FUD0894: {
      source: `${frame}<link rel="snippet" href="../snippets/ui.fud">\n@code {\n  const name = 'x';\n  const on = true;\n}\n@section top {}\n@section bottom {}\n<p>@render card(name, tone: on ? "a" : "b")</p>\n`,
    },
    FUD1160: { source: `${layout}<div className="card"></div>\n` },
    // The guide's two (SDD-79): an h1 its piece is not adopted for, and the piece with no h1.
    FUD1440: { source: component('app-head').replace('<span>', '<h1>t</h1><span>'), path: '/p/components/app-head.fud' },
    FUD1441: {
      source: component('app-head').replace('shadowrootmode="open"', 'shadowrootmode="open" shadowrootadoptedstylesheets="h1"'),
      path: '/p/components/app-head.fud',
    },
    // A file input against its field (SDD-81 criterion 29).
    FUD1484: { source: upload('<input type="file" control=@upForm.avatar multiple>'), path: UPLOAD },
    FUD1485: { source: upload('<input type="file" control=@upForm.docs>'), path: UPLOAD },
    FUD1486: { source: upload('<input type="file" control=@upForm.name>'), path: UPLOAD },
  };

  it('has a sample for every code of the table', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...REPAIRED_CODES].sort());
  });

  for (const [code, sample] of Object.entries(SAMPLES)) {
    it(`${code}: the same titles and edits as the bulb, and the file is left without that error`, async () => {
      const path = sample.path ?? ROUTE;
      const typed = sample.typed ?? false;
      const s = setup(sample.source, path, typed);
      const direct = s.diagnostics.flatMap((d) => [...repairsFor(inputOf(s), d)]);
      expect(direct.length, code).toBeGreaterThan(0);
      expect(direct.every((r) => r.code === code && r.edits.every((e) => e.path === path))).toBe(true);

      // The editor's bulb over the whole file, through the plugin.
      const uri = URI.file(path).toString();
      const document = TextDocument.create(uri, 'fud', 1, sample.source);
      const context = fakeServiceContext(
        { [uri]: s.cached },
        () => undefined,
        s.typescript === undefined ? {} : { 'typescript/languageService': s.typescript },
      );
      const configs = new ProjectConfigs(memoryFs({ ...FILES, [path]: sample.source }));
      const service = createFudicService({ index: s.index, stats: new RequestStats(), typescript: true, configs }).create(context);
      const whole = { start: { line: 0, character: 0 }, end: { line: sample.source.split('\n').length, character: 0 } };
      const actions = (await service.provideCodeActions?.(document, whole, { diagnostics: [] }, TOKEN)) ?? [];
      const editor = actions
        .filter((a) => a.edit !== undefined)
        .map((a) => ({
          title: a.title,
          edits: (Object.values(a.edit!.changes ?? {})[0] ?? []).map((e) => ({
            span: span(document.offsetAt(e.range.start), document.offsetAt(e.range.end)),
            newText: e.newText,
          })),
        }));

      expect(direct.map((r) => ({ title: r.title, edits: r.edits.map((e) => ({ span: e.span, newText: e.newText })) }))).toEqual(
        editor,
      );

      // Each repair takes away the diagnostic it repairs, one of them, and adds nothing.
      const before = remaining(sample.source, path, typed);
      for (const repair of direct) {
        const expected = [...before];
        expected.splice(expected.findIndex((d) => d.startsWith(code)), 1);
        expect(remaining(applied(sample.source, repair), path, typed).sort(), repair.title).toEqual(expected.sort());
      }
    });
  }

  it('has no repair for a code outside the table, and none for a diagnostic it cannot place', () => {
    const s = setup(`${layout}<p>x</p>\n`);
    expect(repairsFor(inputOf(s), { ...FUD0056({ span: span(0, 0) }), code: 'FUD9999' as never })).toEqual([]);
    expect(repairsFor(inputOf(s), FUD0056({ span: span(0, 0) }))).toEqual([]);
  });
});

describe('every title of the language server is English (criterion 10)', () => {
  const SRC = fileURLToPath(new URL('../src/', import.meta.url));
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = `${dir}/${name}`;
      return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
    });

  /**
   * Every literal on a line that gives a title — `title: …`, `const title = …`, the title argument
   * of a fudspec action — including both arms of a `cond ? 'a' : 'b'`.
   */
  const TITLED = /\btitle\s*[:=]|\blocal\(repair,|\bcreate\(`/u;
  const LITERAL = /'([^']*)'|"([^"]*)"|`([^`]*)`/gu;
  const titles = walk(SRC.replace(/[\\/]$/u, '')).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => TITLED.test(line) && !/^\s*(\*|\/\/)/u.test(line))
      .flatMap((line) => [...line.matchAll(LITERAL)].map((m) => m[1] ?? m[2] ?? m[3]!)),
  );

  /** What Spanish leaves in a title: its letters, its marks and its common verbs and words. */
  const SPANISH =
    /[ñáéíóúü¿¡]|\b(añadir|anadir|escribir|envolver|entrecomillar|completar|cambiar|quitar|enlazar|crear|explicar|las|los|del|de|el|la|requeridas?|secciones|valor)\b/iu;

  it('finds the titles it is meant to read', () => {
    for (const title of ['Quote the value', 'Wrap in @( … )', "Add the layout's required props", 'Explain ${code}']) {
      expect(titles).toContain(title);
    }
    expect(titles.length).toBeGreaterThan(25);
  });

  it('none of them is Spanish', () => {
    expect(titles.filter((t) => SPANISH.test(t))).toEqual([]);
  });

  it('the titles of §4.4 come out in English from the repairs themselves', () => {
    const layout = '<link rel="layout" href="../layouts/_layout.fud">\n';
    const all = [
      ...repairs(setup(`${layout}<div title=hello></div>\n`), 'FUD0056'),
      ...repairs(setup(`${layout}<app-badge></app-badge>\n`), 'FUD0191'),
      ...repairs(setup(list('type Items = string[];', 'const item of items'), LIST, true), 'FUD0540'),
      ...repairs(setup('<link rel="layout" href="../layouts/_frame.fud">\n<p>x</p>\n'), 'FUD0890'),
    ].map((r) => r.title);

    expect(all).toEqual([
      'Quote the value',
      'Add <link rel="component"> for <app-badge>',
      'Add key (item)',
      "Add the layout's required sections (top, bottom)",
    ]);
    expect(all.filter((t) => SPANISH.test(t))).toEqual([]);
  });
});
