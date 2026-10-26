/**
 * SDD-61 §4.3, criterion 30 — what the completion offers where the portable view is written.
 *
 * TypeScript's own list is asked of a real language service over the projection, and handed to
 * the decorator as the TypeScript plugin's reply: the decorator is what is under test, and it
 * reads the shapes off the same program.
 */

import { describe, expect, it } from 'vitest';
import type { CompletionItem, CompletionList, LanguageServicePlugin } from '@volar/language-service';
import { CompletionItemKind } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import typescript from 'typescript';
import type ts from 'typescript';
import { regionAt, span } from '@fudic/compiler';
import { clientFileName, GLOBALS_DTS, mapToGenerated } from '@fudic/language-core';
import { CLIENT_CODE_ID } from '@fudic/typecheck';
import { DocumentCache } from '../../src/document-cache.js';
import { filterTypeScriptCompletions } from '../../src/services/ts-completion.js';
import { inPortableView } from '../../src/services/view-completion.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { component, LAYOUT, memoryFs } from '../_support.js';

const PATH = '/p/pages/index.fud';
const FUD_URI = URI.file(PATH);

/** A route with a list, a text, a number, a reactive value and two functions in scope. */
const page = (markup: string, code = ''): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">
@code {
  type Signal<T> = { (): T; set(v: T): void };
  type Row = { name: string; count: Signal<number>; open(): void; done?: () => void };
  let count!: Signal<number>;
  const xs: Row[] = [];
  const s = 'hola';
  const choice: 'a' | 'b' = 'a';
  const n = 1;
  const loose: any = 1;
  const row: Row | undefined = xs[0];
  const helper = (a: number) => a;
  function onClick() {}
  ${code}
}

<article>
  <p>${markup}</p>
</article>
`;

const KINDS: Readonly<Record<string, CompletionItemKind>> = {
  method: CompletionItemKind.Method,
  function: CompletionItemKind.Function,
  property: CompletionItemKind.Property,
  keyword: CompletionItemKind.Keyword,
};

/**
 * A language service over the projection WITH the standard library: the members of a list and
 * of a text are the library's, and `projectionService` mounts none. One for the whole file, with
 * the projection swapped in per test: loading the library is what costs.
 */
const files: Record<string, string> = { [PATH]: '', '/p/fudic-globals.d.ts': GLOBALS_DTS };
let version = 0;
const shared = createLibraryService();

function libraryService(text: string): ts.LanguageService {
  files[PATH] = text;
  version += 1;
  return shared;
}

function createLibraryService(): ts.LanguageService {
  const read = (name: string): string | undefined => files[name] ?? typescript.sys.readFile(name);
  return typescript.createLanguageService({
    getScriptFileNames: () => Object.keys(files),
    getScriptVersion: (name) => (name === PATH ? String(version) : '1'),
    getScriptSnapshot: (name) => {
      const found = read(name);
      return found === undefined ? undefined : typescript.ScriptSnapshot.fromString(found);
    },
    getScriptKind: () => typescript.ScriptKind.TS,
    getCurrentDirectory: () => '/p',
    getCompilationSettings: () => ({ strict: true, target: typescript.ScriptTarget.ES2023, allowNonTsExtensions: true }),
    getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),
    fileExists: (name) => name in files || typescript.sys.fileExists(name),
    readFile: read,
  });
}

/** TypeScript's own entries at a projected offset, as the TypeScript plugin hands them over. */
function typeScriptItems(service: ts.LanguageService, at: number): CompletionItem[] {
  const info = service.getCompletionsAtPosition(PATH, at, {});
  return (info?.entries ?? []).map((entry) => ({
    label: entry.name,
    kind: KINDS[entry.kind] ?? CompletionItemKind.Variable,
    sortText: entry.sortText,
  }));
}

interface Options {
  /** Mount the program. Without it the decorator has only the kinds. */
  readonly typescript?: boolean;
  /** The reply, instead of TypeScript's own list. */
  readonly answer?: readonly CompletionItem[];
  /** More declarations for the `@code`. */
  readonly code?: string;
}

/** The labels the decorator lets through at the `|` of `markup`. */
async function labelsAt(markup: string, options: Options = {}): Promise<readonly string[]> {
  // The LAST `|`: the `@code` writes a union of its own before the caret.
  const source = page(markup.replace('|', ''), options.code?.replace('|', ''));
  const at = page(markup, options.code).lastIndexOf('|');
  const index = new WorkspaceIndex(
    memoryFs({
      '/p/layouts/_layout.fud': LAYOUT,
      '/p/components/app-badge.fud': component('app-badge'),
      [PATH]: source,
    }),
  );
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, source);
  const client = cached.virtuals.find((v) => v.fileName === clientFileName(cached.path))!;
  const document = TextDocument.create(`file://${client.fileName}`, 'typescript', 1, client.text);
  const generated = mapToGenerated(client, at, 'completion')!;

  const service = libraryService(client.text);
  const answer = options.answer ?? typeScriptItems(service, generated);
  const plugin: LanguageServicePlugin = {
    name: 'typescript-double',
    capabilities: { completionProvider: {} },
    create: () => ({ provideCompletionItems: () => ({ isIncomplete: false, items: [...answer] }) }),
  };
  const [wrapped] = filterTypeScriptCompletions([plugin]);
  const provided = options.typescript === false ? {} : { 'typescript/languageService': service };
  const instance = wrapped!.create(fakeServiceContext({ [FUD_URI.toString()]: cached }, () => [FUD_URI, CLIENT_CODE_ID], provided));

  const list = (await instance.provideCompletionItems?.(document, document.positionAt(generated), { triggerKind: 1 }, TOKEN)) as
    | CompletionList
    | undefined;
  return (list?.items ?? []).map((item) => item.label);
}

const sorted = (labels: readonly string[]): readonly string[] => [...labels].sort();

describe('after a `.` in the view', () => {
  it('offers the five pieces on a list, and not `find` nor `join` (criterion 30)', async () => {
    expect(sorted(await labelsAt('@(xs.|)'))).toEqual(['filter', 'length', 'map', 'reduce', 'toSorted']);
  });

  it('offers only `length` on a text, a literal union included', async () => {
    expect(await labelsAt('@(s.|)')).toEqual(['length']);
    expect(await labelsAt('@(choice.|)')).toEqual(['length']);
  });

  it('drops the methods and the functions of an object, and keeps a reactive value', async () => {
    expect(sorted(await labelsAt('@(row?.|)'))).toEqual(['count', 'name']);
  });

  it('drops every method of a number', async () => {
    expect(await labelsAt('@(n.|)')).toEqual([]);
  });

  it('leaves what is read off an `any` alone: there is no shape to narrow by', async () => {
    const answer = [{ label: 'whatever', kind: CompletionItemKind.Method }];
    expect(await labelsAt('@(loose.|)', { answer })).toEqual(['whatever']);
  });

  it('decides by the kind a member the type does not have', async () => {
    const answer = [
      { label: 'name', kind: CompletionItemKind.Property },
      { label: 'open', kind: CompletionItemKind.Method },
      { label: 'ghost', kind: CompletionItemKind.Method },
      { label: 'ghostField', kind: CompletionItemKind.Field },
    ];
    expect(await labelsAt('@(row?.|)', { answer })).toEqual(['name', 'ghostField']);
  });

  it('narrows the implicit form, an attribute value and an `@{ }` too', async () => {
    expect(sorted(await labelsAt('@xs.|'))).toEqual(['filter', 'length', 'map', 'reduce', 'toSorted']);
    expect(sorted(await labelsAt('<span title="@xs.|"></span>'))).toEqual(['filter', 'length', 'map', 'reduce', 'toSorted']);
    expect(await labelsAt('@{ const k = s.| }')).toEqual(['length']);
  });

  it('decides by the kinds alone when no program is mounted', async () => {
    const answer = [
      { label: 'find', kind: CompletionItemKind.Method },
      { label: 'length', kind: CompletionItemKind.Property },
    ];
    expect(await labelsAt('@(xs.|)', { answer, typescript: false })).toEqual(['length']);
  });
});

describe('on a name in the view', () => {
  it('offers the values in scope and `undefined`, and no function nor other global', async () => {
    const labels = await labelsAt('@(|)');

    expect(labels).toEqual(expect.arrayContaining(['xs', 's', 'count', 'row', 'undefined', 'true']));
    expect(labels).not.toContain('onClick');
    expect(labels).not.toContain('helper');
    expect(labels).not.toContain('JSON');
    expect(labels).not.toContain('typeof');
  });

  it('keeps `undefined` where the template scope narrows the list: after a `@`', async () => {
    const labels = await labelsAt('@|');

    // Offered as reads, with the `@` the author typed in front.
    expect(labels).toEqual(expect.arrayContaining(['@xs', '@undefined']));
    expect(labels).not.toContain('@onClick');
  });

  it('offers `@empty` after the `}` of a `@foreach`, and not elsewhere (criterion 30)', async () => {
    expect(await labelsAt('@foreach (const r of xs) key (r.name) { <i>x</i> } @|')).toContain('@empty');
    expect(await labelsAt('@|')).not.toContain('@empty');
  });

  it('does not let the names of the parse put a function back', async () => {
    const labels = await labelsAt('@|', { answer: [], typescript: false });

    expect(labels).toContain('@xs');
    expect(labels).not.toContain('@onClick');
  });

  it('decides by the band and the kind what the scope cannot place', async () => {
    const answer = [
      { label: 'phantom', kind: CompletionItemKind.Variable, sortText: '11' },
      { label: 'phantomFn', kind: CompletionItemKind.Function, sortText: '11' },
      { label: 'stale', kind: CompletionItemKind.Variable, sortText: 'z11' },
      { label: 'unbanded', kind: CompletionItemKind.Variable },
      { label: 'Math', kind: CompletionItemKind.Variable, sortText: '15' },
    ];
    expect(await labelsAt('@(|)', { answer })).toEqual(['phantom', 'stale', 'unbanded']);
    expect(await labelsAt('@(|)', { answer, typescript: false })).toEqual(['phantom', 'stale', 'unbanded']);
  });
});

describe('where nothing is narrowed', () => {
  it('leaves a handler alone: `@click` is browser code (criterion 30)', async () => {
    expect(await labelsAt('<button @click=@(() => xs.|)></button>')).toContain('find');
  });

  it('leaves a `bus:` and a callback alone', async () => {
    expect(await labelsAt('<div bus:cart=@(xs.|)></div>')).toContain('find');
    expect(await labelsAt('<app-badge .pick=@((a) => xs.|)></app-badge>')).toContain('find');
  });

  it('narrows a prop whose value is not a callback', async () => {
    expect(await labelsAt('<app-badge .items=@(xs.|)></app-badge>')).not.toContain('find');
  });

  it('leaves the `@code` alone', async () => {
    expect(await labelsAt('x', { code: 'const k = xs.|' })).toContain('find');
  });
});

describe('inPortableView', () => {
  /** Whether the `|` of `markup` is in the view. */
  function at(markup: string): boolean {
    const source = page(markup.replace('|', ''));
    const offset = page(markup).lastIndexOf('|');
    const cached = new DocumentCache(new WorkspaceIndex(memoryFs({ [PATH]: source }))).get(PATH, 1, source);
    return inPortableView(source, offset, regionAt(source, cached.html, offset));
  }

  it('is the view in markup only where a `@` opens something', () => {
    expect(at('@|')).toBe(true);
    expect(at('plain |text')).toBe(false);
  });

  it('is the view in a tag only past a `=@`', () => {
    expect(at('<span .name=@xs.|></span>')).toBe(true);
    expect(at('<span |></span>')).toBe(false);
  });

  it('is not the view in a `bus:` written with an expression', () => {
    expect(at('<div bus:(EVENTS.cart)=@(xs.|)></div>')).toBe(false);
  });

  it('is the view in a plain attribute value with a `@`', () => {
    expect(at('<span title="a @xs.|"></span>')).toBe(true);
  });

  it('is the view in an interpolation with no attribute', () => {
    expect(at('@(|)')).toBe(true);
  });

  it('is never the view in CSS', () => {
    expect(inPortableView('a { }', 2, { kind: 'css', span: span(0, 5) })).toBe(false);
  });
});
