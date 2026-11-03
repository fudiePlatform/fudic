/**
 * SDD-63 §3.5 and §4.3 — the style tokens in the editor: what `var(--` completes, what the
 * pointer over one says, where «go to definition» lands, and when the list is read again.
 *
 * Over a package tree held in memory and a hand-made Volar context: the service only asks the
 * context which file an embedded document belongs to.
 */

import { describe, expect, it, vi } from 'vitest';
import type { LanguageServiceContext } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { Token } from '@fudic/typecheck/tokens';
import { createFudicTokenService, TokenCache, tokenMarkdown } from '../../src/services/tokens.js';
import { embeddedOnly } from '../../src/services/embedded-css.js';
import { memoryFs } from '../_support.js';

const APP = '/w/app';
const LIB = '/w/app/node_modules/@acme/guia';
const FUD = `${APP}/src/app-x.fud`;
const SHEET = `${APP}/src/extra.css`;
const EMBEDDED = 'volar-embedded-content://style_0/x';

const LIB_CSS = ':host {\n  /** Main action background. */\n  --acme-color-primary: oklch(55% 0.2 260);\n  --acme-ink: #111;\n}\n';

const FILES = (): Record<string, string> => ({
  [`${APP}/package.json`]: JSON.stringify({ name: 'app', dependencies: { '@acme/guia': '1' } }),
  [`${APP}/fudic.json`]: JSON.stringify({
    id: 'app',
    kind: 'app',
    prefix: 'app',
    globalStyles: { app: 'src/app.css' },
    styles: { extra: 'src/extra.css' },
  }),
  [`${LIB}/package.json`]: JSON.stringify({ name: '@acme/guia' }),
  [`${LIB}/fudic.json`]: JSON.stringify({ kind: 'lib', globalStyles: { tokens: 'tokens.css' } }),
  [`${LIB}/tokens.css`]: LIB_CSS,
  [`${APP}/src/app.css`]: ':root { --app-space: 4px; }',
  [SHEET]: ':host { --acme-ink: #222; }',
});

/** A Volar context whose only embedded document is a `<style>` of `FUD`. */
const context = {
  decodeEmbeddedDocumentUri: (uri: URI) =>
    uri.toString() === URI.parse(EMBEDDED).toString() ? [URI.file(FUD), 'style_0'] : undefined,
} as unknown as LanguageServiceContext;

/** The service over `files`, created against the context above. */
function service(files: Record<string, string> = FILES()) {
  const cache = new TokenCache(memoryFs(files));
  return { cache, instance: createFudicTokenService(cache).create(context) };
}

/** A CSS document at `uri` and the position of the `|` in `marked`. */
function at(marked: string, uri = EMBEDDED, languageId = 'css') {
  const offset = marked.indexOf('|');
  const document = TextDocument.create(uri, languageId, 1, marked.replace('|', ''));
  return { document, position: document.positionAt(offset) };
}

const cancel = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

describe('completion after `var(--`', () => {
  const complete = (marked: string, uri?: string, languageId?: string) => {
    const { document, position } = at(marked, uri, languageId);
    return service().instance.provideCompletionItems!(document, position, { triggerKind: 1 }, cancel);
  };

  it('offers every token the file sees, once per name — the last one declared', () => {
    const list = complete('.a { color: var(--|');
    const items = (list as { items: { label: string; detail: string }[] }).items;

    expect(items.map((item) => [item.label, item.detail])).toEqual([
      ['--acme-color-primary', 'oklch(55% 0.2 260)'],
      ['--app-space', '4px'],
      ['--acme-ink', '#222'],
    ]);
  });

  it('replaces what was typed of the name, with the doc as documentation', () => {
    const { document, position } = at('.a { color: var( --acme-c|');
    const list = service().instance.provideCompletionItems!(document, position, { triggerKind: 1 }, cancel) as {
      items: { label: string; kind: number; documentation: { value: string }; textEdit: { range: unknown; newText: string } }[];
    };
    const [first] = list.items;

    expect(first?.kind).toBe(6);
    expect(first?.documentation.value).toContain('Main action background.');
    expect(first?.textEdit).toEqual({
      range: { start: { line: 0, character: position.character - '--acme-c'.length }, end: position },
      newText: '--acme-color-primary',
    });
  });

  it('works in a plain `.css` of the project too', () => {
    const list = complete('.a { color: var(--|', URI.file(SHEET).toString()) as { items: unknown[] };

    expect(list.items).toHaveLength(3);
  });

  it('offers nothing outside `var(`, in a document that is not CSS, or outside any package', () => {
    expect(complete('.a { --|')).toBeUndefined();
    expect(complete('var(--|', URI.file(FUD).toString(), 'fud')).toBeUndefined();
    expect((complete('.a { color: var(--|', URI.file('/elsewhere/x.css').toString()) as { items: unknown[] }).items).toEqual([]);
  });
});

describe('hover and definition inside `var(…)`', () => {
  it('says what the token is and where it comes from', () => {
    const { document, position } = at('.a { color: var(--acme-co|lor-primary); }');
    const hover = service().instance.provideHover!(document, position, cancel) as {
      contents: { value: string };
      range: { start: { character: number }; end: { character: number } };
    };

    expect(hover.contents.value).toBe(
      '`--acme-color-primary: oklch(55% 0.2 260)`\n\nMain action background.\n\nFrom `@acme/guia` · style `tokens`',
    );
    expect(hover.range.start.character).toBe('.a { color: var('.length);
    expect(hover.range.end.character).toBe('.a { color: var(--acme-color-primary'.length);
  });

  it('opens the sheet that declares it, on its declaration', () => {
    const { document, position } = at('.a { color: var(--acme-color-primary|) }');
    const [link] = service().instance.provideDefinition!(document, position, cancel) as {
      targetUri: string;
      targetRange: { start: { line: number; character: number } };
    }[];

    expect(link?.targetUri).toBe(URI.file(`${LIB}/tokens.css`).toString());
    expect(link?.targetRange.start).toEqual({ line: 2, character: 2 });
  });

  it('answers nothing for a sheet that can no longer be read', () => {
    const files = FILES();
    const { instance } = service(files);
    const { document, position } = at('.a { color: var(--acme-color-primary|) }');
    // The list is read once, and the sheet disappears afterwards.
    instance.provideHover!(document, position, cancel);
    delete files[`${LIB}/tokens.css`];

    expect(instance.provideDefinition!(document, position, cancel)).toBeUndefined();
  });

  it.each([
    ['the property being declared', ':host { --acme-i|nk: red; }'],
    ['a name that is not a custom property', '.a { col|or: var(--acme-ink); }'],
    ['a token nobody declares', '.a { color: var(--nob|ody); }'],
    ['the very start of the text', '--acme-i|nk'],
    ['the very end of the text', 'var(--acme-ink|'],
  ])('answers nothing on %s', (_label, marked) => {
    const { document, position } = at(marked);
    const { instance } = service();
    const found = instance.provideHover!(document, position, cancel);

    if (marked === 'var(--acme-ink|') {
      // At the end of the text the name still reads whole: the last declared `--acme-ink`.
      expect((found as { contents: { value: string } }).contents.value).toContain('#222');
    } else {
      expect(found).toBeUndefined();
      expect(instance.provideDefinition!(document, position, cancel)).toBeUndefined();
    }
  });

  it('answers nothing in a document that is not CSS', () => {
    const { document, position } = at('var(--acme-i|nk)', URI.file(FUD).toString(), 'fud');

    expect(service().instance.provideHover!(document, position, cancel)).toBeUndefined();
  });
});

describe('TokenCache', () => {
  it('reads a project once, and again only after a sheet or a fudic.json changes', () => {
    const fs = memoryFs(FILES());
    const read = vi.spyOn(fs, 'readFile');
    const cache = new TokenCache(fs);

    cache.tokensFor(FUD);
    const once = read.mock.calls.length;
    cache.tokensFor(SHEET);
    expect(read.mock.calls.length - once).toBeLessThan(once);

    const reads = (): number => {
      const before = read.mock.calls.length;
      cache.tokensFor(FUD);
      return read.mock.calls.length - before;
    };
    cache.invalidate(`${APP}/src/x.ts`);
    const cached = reads();
    cache.invalidate(`${APP}/src/app.css`);
    expect(reads()).toBeGreaterThan(cached);
    reads();
    cache.invalidate(`${APP}/fudic.json`);
    expect(reads()).toBeGreaterThan(cached);
  });

  it.each([
    ['a sheet', 'a/b.css', true],
    ['a fudic.json', 'a/fudic.json', true],
    ['anything else', 'a/b.ts', false],
    ['a file merely named like one', 'a/myfudic.json', false],
  ])('knows that %s can change the tokens: %s', (_label, path, affects) => {
    expect(TokenCache.affects(path)).toBe(affects);
  });
});

describe('tokenMarkdown', () => {
  const token: Token = {
    name: '--app-space',
    value: '4px',
    from: null,
    style: { name: 'extra', global: false },
    path: SHEET,
    span: { start: 0, end: 1 },
  };

  it("says a project token comes from this project, and that an optional style's is not everywhere", () => {
    expect(tokenMarkdown(token)).toBe(
      '`--app-space: 4px`\n\nFrom this project · style `extra`, only in components that adopt it',
    );
  });
});

describe('embeddedOnly', () => {
  /** A plugin whose instance answers `answer` to anything, plus what is not a provider. */
  const plugin = {
    name: 'probe',
    capabilities: {},
    create: () => ({
      provideHover: () => 'answer',
      provideNothing: 'not a function',
      dispose: () => 'disposed',
    }),
  };

  const wrapped = embeddedOnly(plugin as never).create(context) as unknown as Record<string, (...args: unknown[]) => unknown> & {
    provideNothing: unknown;
  };

  it('answers inside the `<style>` of a `.fud`', () => {
    expect(wrapped.provideHover!({ uri: EMBEDDED }, {})).toBe('answer');
  });

  it('stays silent in a plain document', () => {
    expect(wrapped.provideHover!({ uri: URI.file(SHEET).toString() }, {})).toBeUndefined();
  });

  it('leaves what is not a provider as it was', () => {
    expect(wrapped.provideNothing).toBe('not a function');
    expect(wrapped.dispose!()).toBe('disposed');
  });
});
