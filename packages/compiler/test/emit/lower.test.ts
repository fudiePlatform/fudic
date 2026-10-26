/**
 * SDD-61 §4.4, points 1 and 2: the source the emit compiles instead of the file — presence as
 * `== null`, and the defaults of a pattern of the view as `?? default`.
 */

import { describe, expect, it } from 'vitest';
import { lowerPortable } from '../../src/emit/lower.js';
import { ExpandedText } from '../../src/expand/offsets.js';
import { emitComponentModule, resolveComponents } from '../../src/emit/index.js';
import type { ResolveIo } from '../../src/types/io.js';
import { memoryIo } from './_support.js';

const component = (code: string, template: string): string =>
  `@code {\n${code}}\n<x-low>\n  <template shadowrootmode="open">${template}</template>\n</x-low>\n`;

const lowered = (code: string, template: string): string | undefined =>
  lowerPortable('/x-low.fud', component(code, template))?.source;

const markup = (template: string): string | undefined => {
  const out = lowered('', template);
  return out === undefined ? undefined : out.slice(out.indexOf('<x-low>'));
};

describe('presence (§4.4.1)', () => {
  it('a file with nothing to lower is handed back as is, and is not parsed', () => {
    expect(lowered('  const a = 1;\n', '<p>@a</p>')).toBeUndefined();
  });

  it('a hint that turns out to be nothing of the view lowers nothing', () => {
    expect(lowered('  function f(x) { return x === null; }\n', '<button @click=@(() => f(1) === null)>x</button>')).toBeUndefined();
  });

  it('every place of the view: content, attributes, headers, keys, cases', () => {
    const out = markup(
      '<p title="@(a === null)">@(a !== undefined)</p>' +
        '@if (undefined === a) {<i></i>}' +
        '@switch (a === null) { case true: <b></b> default: <em></em> }' +
        '@foreach (const x of (xs === null ? [] : xs)) key (x === null ? 0 : x) {<s></s>}' +
        '@for (let i = 0; i !== null && i < 1; i++) {<u></u>}' +
        '@while (a !== null) {<q></q>}',
    )!;
    expect(out).toContain('title="@(a == null)">@(a != null)</p>');
    expect(out).toContain('@if (null == a)');
    expect(out).toContain('@switch (a == null)');
    expect(out).toContain('of (xs == null ? [] : xs)) key (x == null ? 0 : x)');
    expect(out).toContain('i != null && i < 1');
    expect(out).toContain('@while (a != null)');
  });

  it('only a comparison with null or undefined: `a === b` and `a === "null"` stay', () => {
    expect(markup('<p>@(a === b) @(a === "null") @((undefined) === a)</p>')).toContain(
      '@(a === b) @(a === "null") @((null) == a)',
    );
  });

  it('not a handler nor a callback, which are free TS (§3.11); a bus: name is the view', () => {
    const out = markup(
      '<b @click=@(() => a === null) .cb=@(() => a === null) bus:(a === null ? "x" : "y")=@go .v=@(a === null)></b>',
    )!;
    expect(out).toContain('@click=@(() => a === null) .cb=@(() => a === null)');
    expect(out).toContain('bus:(a == null ? "x" : "y")=@go');
    expect(out).toContain('.v=@(a == null)');
  });

  it('the arguments of a @render, a markup with no @code, and a degraded header', () => {
    const source =
      '<x-low>\n  <template shadowrootmode="open">@snippet row(v: boolean) { <p>@v</p> }' +
      '<div>@render row(a === null)@if () {<i></i>}</div></template>\n</x-low>\n';
    expect(lowerPortable('/s.fud', source)!.source).toContain('@render row(a == null)');
  });

  it('inside a collection operation of the view too', () => {
    expect(markup('<p>@(xs.filter((x) => x.a !== null).length)</p>')).toContain('x.a != null');
  });

  it('the server cut: what the view reads, transitively, and no function', () => {
    const out = lowered(
      [
        '  import { signal, computed } from "@fudic/core";',
        '  const a = signal(1 === null);',
        '  const b = computed(() => a() !== undefined);',
        '  const f = () => a() === null;',
        '  const unread = signal(2 === null);',
        '  export const shown = 3 === null;',
        '  const { d } = { d: 4 === null };',
        '  let e;',
        '  function g() { return a() === null; }',
        '',
      ].join('\n'),
      '<p>@b() @f() @shown @d @e</p>',
    )!;
    expect(out).toContain('signal(1 == null)');
    expect(out).toContain('a() != null');
    expect(out).toContain('const f = () => a() === null;');
    expect(out).toContain('signal(2 === null)');
    expect(out).toContain('shown = 3 == null');
    expect(out).toContain('{ d: 4 === null }');
    expect(out).toContain('function g() { return a() === null; }');
  });
});

describe('defaults (§4.4.2)', () => {
  it('a @foreach header binds a hidden name, and its body declares the author’s first', () => {
    const out = markup(
      '@foreach (const { slug, author: { name: autor = "nadie" }, featured: destacado = false, ...resto } of posts) key (slug) {<p>@destacado</p>}',
    )!;
    expect(out).toContain(
      '@foreach (const { slug, author: { name: $dflt0 }, featured: $dflt1, ...resto } of posts) key (slug) {' +
        '@{ const autor = $dflt0 ?? ("nadie"), destacado = $dflt1 ?? (false); }<p>@destacado</p>}',
    );
  });

  it('a shorthand, and a header with no key', () => {
    expect(markup('@foreach (let { a = 1 } of xs) {<p>@a</p>}')).toContain(
      '@foreach (let { a: $dflt0 } of xs) {@{ let a = $dflt0 ?? (1); }<p>@a</p>}',
    );
  });

  it('a defaulted nested pattern moves whole, with its own defaults lowered inside it', () => {
    expect(markup('@foreach (const { author: { name = "n", age, born: b = 0 } = fallback } of xs) key (age) {<p></p>}')).toContain(
      '@foreach (const { author: $dflt0 } of xs) key (age) {@{ const { name: $dflt1, age, born: $dflt2 } = $dflt0 ?? (fallback), ' +
        'name = $dflt1 ?? ("n"), b = $dflt2 ?? (0); }<p></p>}',
    );
  });

  it('a @{ } declaration grows the declarators after its last one', () => {
    expect(markup('@{ const { a = 1, b } = x, c = 2; let { d: e = a === null } = y; n += x === null ? 1 : 0; }')).toContain(
      '@{ const { a: $dflt0, b } = x, c = 2, a = $dflt0 ?? (1); let { d: $dflt1 } = y, e = $dflt1 ?? (a === null); n += x == null ? 1 : 0; }',
    );
  });

  it('what has no default is not touched', () => {
    expect(markup('@foreach (const x of xs) key (x) {<p></p>}@foreach (const { a } of xs) key (a) {<p></p>}@foreach (x of xs) {<p></p>}@{ const { b } = y; const [c = 1] = z; }')).toBeUndefined();
  });

  it('maps every position of the result back to the file', () => {
    const source = component('', '@{ const { a = 1 } = x; }<p>@a</p>');
    const result = lowerPortable('/x-low.fud', source)!;
    const at = result.source.indexOf('<p>');
    expect(result.map.origin(at)).toEqual({ file: '/x-low.fud', offset: source.indexOf('<p>'), literal: true });
  });
});

describe('the emit compiles the lowered text, and reports in the file’s coordinates', () => {
  const io = (files: Record<string, string>, extra: Partial<ResolveIo> = {}): ResolveIo => ({ ...memoryIo(files), ...extra });
  const page = '<link rel="component" href="./x-low.fud">\n<html><head></head><body><x-low></x-low></body></html>\n';

  it('the server module writes `!= null` and the `??` of a default', () => {
    const files = { '/page.fud': page, '/x-low.fud': component('  const a = null;\n', '@{ const { t = "x" } = { t: a }; }<p>@(a !== null) @t</p>') };
    const graph = resolveComponents('/page.fud', io(files));
    const src = emitComponentModule(graph, graph.components.get('x-low')!, {});
    expect(src).toContain('a != null');
    expect(src).toContain('t = $dflt0 ?? ("x")');
  });

  it('a file whose text changed is lowered again; the host’s own rewrite is read through', () => {
    const files: Record<string, string> = { '/page.fud': page, '/x-low.fud': component('', '<p>@(1 === null)</p>') };
    const disk = files['/x-low.fud']!;
    const identity = new ExpandedText();
    identity.copy('/x-low.fud', disk, { start: 0, end: disk.length });
    const map = identity.build();
    const host = io(files, { origin: (path) => (path === '/x-low.fud' ? { source: disk, map } : undefined) });
    const first = resolveComponents('/page.fud', host);
    expect(first.components.get('x-low')!.source).toContain('1 == null');
    files['/x-low.fud'] = component('', '<p>@(2 === null)</p>');
    const second = resolveComponents('/page.fud', host);
    expect(second.components.get('x-low')!.source).toContain('2 == null');
  });
});
