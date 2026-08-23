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
