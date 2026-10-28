/**
 * SDD-68 — the client chunk keeps the `@code` in the order the author wrote it.
 *
 * What the server evaluates (the cut) and what only the browser runs (`@client`) used to come out
 * as two runs, the cut first. A `task` whose `source` reads a signal declared further up runs
 * that `source` as it is created, so a task of the cut written AFTER a browser-only signal read
 * it before its `const`: «Cannot access 'texto' before initialization» on /usuarios. Order is
 * the `.fud`'s, for a route and for a component.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import { emitComponentClientModule, emitRouteClientModule, resolveComponents } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const LAYOUT = '<!DOCTYPE html><html><head>@RenderHead()</head><body><main>@RenderBody()</main></body></html>';

const CODE = [
  '  import { signal, task } from "@fudic/core";',
  '  import { search } from "./api.js";',
  '  const texto = signal("");',
  '  const found = task(search, () => ({ q: texto() }), { initial: [] });',
  '  function buscar(e) { texto.set(e.target.value); }',
].join('\n');

const VIEW = '<input @input=@buscar><span>@(found.pending() ? "B" : "")</span>';

/** Where each of `needles` sits in `code`, in the order given: every one found. */
function positions(code: string, needles: readonly string[]): number[] {
  return needles.map((needle) => {
    const at = code.indexOf(needle);
    expect(at, needle).toBeGreaterThan(-1);
    return at;
  });
}

const ascending = (xs: readonly number[]): boolean => xs.every((x, i) => i === 0 || xs[i - 1]! < x);

describe('the author order of the @code in the client chunk', () => {
  it('a route: the signal comes before the task whose source reads it', () => {
    const route = `<link rel="layout" href="./l.fud">\n@code {\n${CODE}\n}\n${VIEW}\n`;
    const code = emitRouteClientModule(resolveDocument('/r.fud', memoryIo({ '/r.fud': route, '/l.fud': LAYOUT })).value)!;
    expect(ascending(positions(code, ['const texto = signal', 'const found = task', 'function buscar']))).toBe(true);
  });

  it('a component: the same', () => {
    const io = memoryIo({
      '/page.fud': '<link rel="component" href="./x-o.fud">\n<html><head></head><body><x-o></x-o></body></html>\n',
      '/x-o.fud': `@code {\n${CODE}\n}\n<x-o>\n  <template shadowrootmode="open">${VIEW}</template>\n</x-o>\n`,
    });
    const graph = resolveComponents('/page.fud', io);
    const code = emitComponentClientModule(graph, graph.components.get('x-o')!);
    expect(ascending(positions(code, ['const texto = signal', 'const found = task', 'function buscar']))).toBe(true);
  });

  it('a @client block between two statements of the cut stays between them', () => {
    const route = [
      '<link rel="layout" href="./l.fud">',
      '@code {',
      '  import { signal } from "@fudic/core";',
      '  const a = signal(1);',
      '  @client {',
      '    const b = a() + 1;',
      '  }',
      '  const c = signal(3);',
      '  function f() { a.set(b + c()); }',
      '}',
      '<button @click=@f>@a() @c()</button>',
    ].join('\n');
    const code = emitRouteClientModule(resolveDocument('/r.fud', memoryIo({ '/r.fud': route, '/l.fud': LAYOUT })).value)!;
    expect(ascending(positions(code, ['const a = signal', 'const b = a()', 'const c = signal', 'function f()']))).toBe(true);
  });
});
