/**
 * BUG-23 — the names a template may write, and what each one may be written AS.
 *
 * The list comes from the statements Oxc already parsed, never from the text and never from a
 * TypeScript program: the file parses, so the list exists. That is the whole reason it can be
 * a SOURCE of completions and not only a filter over somebody else's — an empty answer from
 * TypeScript no longer empties what the developer sees.
 */

import { describe, expect, it } from 'vitest';
import type { CachedDocument } from '../../src/document-cache.js';
import { batchDocumentJs } from '../../src/js-batch.js';
import { parseFud } from '../../src/parse.js';
import { scopeNames, templateScope } from '../../src/services/template-scope.js';

/** A `CachedDocument` with only what this module reads: the tree and the Oxc batch. */
function cached(source: string): CachedDocument {
  const { document, html } = parseFud(source);
  return { source, document, html, js: batchDocumentJs(source, document) } as CachedDocument;
}

/** A component whose `@code` and `@client` hold `code`. */
const component = (code: string): string =>
  `@code {\n${code}\n}\n\n<app-badge>\n  <template shadowrootmode="open">\n    <span>x</span>\n  </template>\n</app-badge>\n`;

/** A page — a document with no host tag of its own, which is what puts `data` in scope. */
const page = (code: string): string =>
  `<link rel="layout" href="./_layout.fud">\n@code {\n${code}\n}\n\n<article>\n  <p>x</p>\n</article>\n`;

/** The scope of a component whose `@client` holds `code`. */
const clientScope = (code: string) => templateScope(cached(component(`  @client {\n${code}\n  }`)));

describe('templateScope', () => {
  it('reads the props a component destructured out of `props<T>()`', () => {
    const scope = templateScope(
      cached(component('  const { tone, size } = props<{ tone?: string; size?: number }>();')),
    );

    expect([...scope.keys()]).toEqual(['tone', 'size']);
  });

  it('reads the reactives and the handlers of `@client`', () => {
    const scope = clientScope(
      [
        "    const titulo = 'Hola';",
        '    function onClick() {}',
        '    const onPick = () => {};',
        '    const onDrop = function () {};',
        '    class Thing {}',
      ].join('\n'),
    );

    expect(scope.get('titulo')).toBe('value');
    expect(scope.get('onClick')).toBe('function');
    expect(scope.get('onPick')).toBe('function');
    expect(scope.get('onDrop')).toBe('function');
    // A class is callable with `new` and never as a listener, so it is a value.
    expect(scope.get('Thing')).toBe('value');
  });

  it('walks the patterns a declaration binds through, so a destructured handler survives', () => {
    const scope = clientScope(
      [
        '    declare const obj: { a: number; b: number; c: number };',
        '    declare const xs: number[];',
        '    const { a, b: alias, ...rest } = obj;',
        '    const { c = 1 } = obj;',
        '    const [first, , third] = xs;',
        '    const [head, ...tail] = xs;',
      ].join('\n'),
    );

    expect([...scope.keys()]).toEqual(
      expect.arrayContaining(['a', 'alias', 'rest', 'c', 'first', 'third', 'head', 'tail']),
    );
  });

  it('only a lone identifier carries the kind: a destructured name is a value', () => {
    // `const { onPick } = handlers()` has no initializer per name to read a shape from, so
    // guessing that `onPick` is callable would be inventing an answer.
    const scope = clientScope(
      ['    declare function handlers(): { onPick: () => void };', '    const { onPick } = handlers();'].join(
        '\n',
      ),
    );

    expect(scope.get('onPick')).toBe('value');
  });

  it('leaves out what the template cannot reach: a nested name and `@server`', () => {
    const source = component(
      [
        '  @server {',
        '    export async function load(): Promise<{ n: number }> {',
        '      const secret = 1;',
        '      return { n: secret };',
        '    }',
        '  }',
        '',
        '  @client {',
        '    function outer() {',
        '      const inner = 1;',
        '      return inner;',
        '    }',
        '  }',
      ].join('\n'),
    );
    const scope = templateScope(cached(source));

    expect(scope.has('load')).toBe(false);
    expect(scope.has('secret')).toBe(false);
    expect(scope.has('inner')).toBe(false);
    expect(scope.get('outer')).toBe('function');
  });

  it('declares `data` for a page, and never for a component', () => {
    // A component receives props and has no route data to read (SDD-23 §4.2).
    expect(templateScope(cached(page('  type PageData = { title: string };'))).get('data')).toBe(
      'value',
    );
    expect(templateScope(cached(component('  const x = 1;'))).has('data')).toBe(false);
  });

  it('survives a `@client` Oxc could not parse: a broken file still has a template', () => {
    // No AST for the fragment means no names from it, not an exception — the developer is
    // mid-keystroke, which is exactly when the list is asked for.
    const scope = clientScope('    const = ;');

    expect(scope.size).toBe(0);
  });
});

/**
 * §2.9 — the names a loop declares, read from the PARSE.
 *
 * No TypeScript program exists in this file, and that is the point. The first fix for this
 * read the bindings off TypeScript's reply, which worked in a fixture and not in a real
 * project: where the program has not loaded, or the `tsconfig` does not reach the file, the
 * reply is empty and the developer was back to the file's top-level names. The rule of this
 * module is the one that holds — the file parses, so the list exists.
 *
 * The offset is the whole question: the same document answers differently depending on where
 * the caret is, which is what a scope IS.
 */
describe('templateScope inside a loop', () => {
  /** A page with `markup` in its body, and the offset of `|` in it. */
  const at = (markup: string) => {
    const body = markup.replace('|', '');
    const source =
      '<link rel="layout" href="./_layout.fud">\n@code {\n  @client {\n' +
      '    const rows = [[1, 2]];\n  }\n}\n\n<article>\n' +
      `${body}\n</article>\n`;
    const offset = source.indexOf(body) + markup.indexOf('|');
    return templateScope(cached(source), offset);
  };

  it('adds the binding of a `@foreach` inside its body', () => {
    expect([...at('@foreach (const item of rows) {\n  @|\n}').keys()]).toContain('item');
  });

  it('adds the counter of a `@for`', () => {
    expect([...at('@for (let i = 0; i < 3; i++) {\n  @|\n}').keys()]).toContain('i');
  });

  it('adds BOTH bindings of two nested loops, and neither leaks out of its block', () => {
    const nested = '@foreach (const row of rows) {\n  @foreach (const cell of row) {\nMARK  }\n}';
    const inner = [...at(nested.replace('MARK', '    @|\n')).keys()];

    expect(inner).toContain('row');
    expect(inner).toContain('cell');
    // The file's own names are still there: a block ADDS to the scope.
    expect(inner).toContain('rows');
    expect(inner).toContain('data');

    // Between the two loops, only the outer one has been entered.
    const between = [...at('@foreach (const row of rows) {\n  @|\n  @foreach (const cell of row) {\n  }\n}').keys()];
    expect(between).toContain('row');
    expect(between).not.toContain('cell');
  });

  it('does not add it outside the construct, nor inside its own header', () => {
    // Past the closing `}` the binding is gone, and inside `(const item of rows)` it is being
    // declared rather than read — the scope there is still the one outside.
    expect([...at('@foreach (const item of rows) {\n  <b>x</b>\n}\n@|').keys()]).not.toContain('item');
    expect([...at('@foreach (const item of ro|ws) {\n  <b>x</b>\n}').keys()]).not.toContain('item');
  });

  it('adds it for the `key (…)`, which is evaluated in the body’s scope', () => {
    // Decision 91: `key (item.id)` sees the binding, so the list there has to as well.
    expect([...at('@foreach (const item of rows) key (|) {\n  <b>x</b>\n}').keys()]).toContain('item');
  });

  it('reads a destructuring pattern, not just a plain name', () => {
    const scope = at('@foreach (const { id, tag } of rows) {\n  @|\n}');

    expect([...scope.keys()]).toContain('id');
    expect([...scope.keys()]).toContain('tag');
  });

  it('adds nothing for the constructs that declare nothing', () => {
    // A `@while` holds a condition and a `@for (;;)` has no initializer at all: neither opens
    // a name, and a header the parser could not read (FUD0070) opens none either.
    expect([...at('@while (rows.length) {\n  @|\n}').keys()]).toEqual(['rows', 'data']);
    expect([...at('@for (;;) {\n  @|\n}').keys()]).toEqual(['rows', 'data']);
    expect([...at('@foreach {\n  @|\n}').keys()]).toEqual(['rows', 'data']);
  });

  it('adds nothing for a header that declares no name of its own', () => {
    // `for (x of xs)` assigns to something that already exists, and `for (i = 0; …)` does the
    // same: the header's left-hand side is an expression, not a declaration, so there is no
    // new name in the body and offering one would be inventing it.
    expect([...at('@foreach (rows of rows) {\n  @|\n}').keys()]).toEqual(['rows', 'data']);
    expect([...at('@for (rows = 0; rows < 3; rows++) {\n  @|\n}').keys()]).toEqual([
      'rows',
      'data',
    ]);
  });

  it('adds nothing for a header Oxc could not read, which is every keystroke of writing one', () => {
    // The header reaches Oxc verbatim, so a half-written one is a syntax error and no
    // statement comes back: the loop contributes nothing, and asking is still safe.
    //
    // What it also costs is the file's OWN names, and that is the batch rather than this
    // module: Oxc is invoked once per file (the golden rule), so a fragment that does not
    // parse takes the statement list down with it. `data` survives because the projection
    // declares it and no `@code` had to be read for that.
    expect([...at('@foreach (const of) {\n  @|\n}').keys()]).toEqual(['data']);
  });

  it('adds nothing when no offset is asked about', () => {
    // The file-level answer stays available for the callers that have no position to give.
    const source =
      '<link rel="layout" href="./_layout.fud">\n@code {\n  @client {\n' +
      '    const rows = [[1, 2]];\n  }\n}\n\n<article>\n@foreach (const item of rows) {\n  <b>x</b>\n}\n</article>\n';

    expect([...templateScope(cached(source)).keys()]).toEqual(['rows', 'data']);
  });

  it('says nothing at all in a layout, loop or no loop', () => {
    const layout =
      '<!DOCTYPE html>\n<html>\n<head>@RenderHead()</head>\n<body>\n' +
      '@foreach (const item of []) {\n  <b>x</b>\n}\n@RenderBody()\n</body>\n</html>\n';

    expect(templateScope(cached(layout), layout.indexOf('<b>')).size).toBe(0);
  });
});

describe('scopeNames', () => {
  const scope = new Map([
    ['counter', 'value'],
    ['onClick', 'function'],
  ] as const);

  it('gives every name when anything may be written', () => {
    expect(scopeNames(scope, false)).toEqual(['counter', 'onClick']);
  });

  it('gives only what can be called after an event’s `=`', () => {
    expect(scopeNames(scope, true)).toEqual(['onClick']);
  });
});
