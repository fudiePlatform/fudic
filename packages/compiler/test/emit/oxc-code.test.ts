/**
 * `@code` extraction (Oxc) — the prop-default and inert-signal reading that feeds the
 * component module. Covers the shapes the home fixtures do not exercise (a prop with no
 * default, `signal()` with no initial, a non-{props,signal} declaration, rest/spread in
 * the pattern, and no `@code` at all), so the extraction's branches stay honest.
 */
import { describe, expect, it } from 'vitest';
import { extractCode } from '../../src/emit/oxc-code.js';
import type { ComponentDocument } from '../../src/document/index.js';
import { parse } from './_support.js';

const componentDoc = (source: string): ComponentDocument => {
  const doc = parse(source);
  if (doc.type !== 'component-document') throw new Error('expected a component document');
  return doc;
};

const wrap = (code: string): string =>
  `${code}<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n`;

describe('extractCode', () => {
  it('reads props (with and without a default) and signals (with and without an initial)', () => {
    const source = wrap(
      '@code {\n' +
        '  const { a, b = 2 } = props<{ a: string; b: number }>();\n' +
        '  const s = signal();\n' +
        '  const t = signal(5);\n' +
        '  const helper = compute();\n' +
        '}\n',
    );
    const { props, signals } = extractCode(source, componentDoc(source));
    expect(props).toEqual([{ name: 'a' }, { name: 'b', def: '2' }]); // 'a' has no default
    expect(signals).toEqual([
      { name: 's', init: 'undefined', kind: 'signal' }, // signal() with no argument
      { name: 't', init: '5', kind: 'signal' },
    ]);
  });

  it('SDD-31 §4.7 — a `computed` is a reactive name too, tagged by kind', () => {
    const source = wrap(
      '@code {\n  const a = signal(1);\n  const total = computed(() => a() * 2);\n  const t = computed();\n}\n',
    );
    expect(extractCode(source, componentDoc(source)).signals).toEqual([
      { name: 'a', init: '1', kind: 'signal' },
      { name: 'total', init: '() => a() * 2', kind: 'computed' },
      { name: 't', init: 'undefined', kind: 'computed' },
    ]);
  });

  it('SDD-31 §6.17 — `effect(...)` in the neutral zone is FUD0570, and nothing else stops', () => {
    const source = wrap(
      '@code {\n' +
        '  const { a } = props<{ a: string }>();\n' +
        '  effect(() => console.log(a));\n' +
        '  const off = effect(() => {});\n' +
        '  const t = signal(1);\n' +
        '  const plain = 7;\n' + // not a call at all
        '  console.log(plain);\n' + // a call, but not through a bare identifier

        '  @client {\n    const fine = effect(() => t());\n  }\n' +
        '}\n',
    );
    const { props, signals, diagnostics } = extractCode(source, componentDoc(source));
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0570', 'FUD0570']);
    const at = source.indexOf('effect(() => console.log(a))');
    expect(diagnostics[0]!.span).toEqual({ start: at, end: at + 'effect(() => console.log(a))'.length });
    // The emit does not throw and does not give up on the file: props and signals are read.
    expect(props).toEqual([{ name: 'a' }]);
    expect(signals).toEqual([{ name: 't', init: '1', kind: 'signal' }]);
  });

  it('SDD-31 §5 — `computed` and `batch` in the neutral zone say nothing', () => {
    const source = wrap('@code {\n  const t = computed(() => 1);\n  batch(() => {});\n}\n');
    expect(extractCode(source, componentDoc(source)).diagnostics).toEqual([]);
  });

  it('skips rest/spread in the props pattern', () => {
    const source = wrap('@code {\n  const { a, ...rest } = props<{ a: string }>();\n}\n');
    expect(extractCode(source, componentDoc(source)).props).toEqual([{ name: 'a' }]);
  });

  it('returns nothing for a component with no @code', () => {
    const source = '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n';
    expect(extractCode(source, componentDoc(source))).toMatchObject({
      props: [],
      signals: [],
      client: { imports: [], body: [] },
      // Empty AND silent: that is what tells the emit there was no code to begin with,
      // as opposed to code it could not read (BUG-13 §5.3).
      diagnostics: [],
    });
  });

  it('splits @client into hoisted imports and closure body, verbatim', () => {
    const source = wrap(
      '@code {\n' +
        '  const { a } = props<{ a: string }>();\n' +
        '  @client {\n' +
        "    import { signal } from '@fudic/core';\n" +
        '    const open = signal(false);\n' +
        '    function toggle() { open.set(!open()); }\n' +
        '  }\n' +
        '}\n',
    );
    const { client } = extractCode(source, componentDoc(source));
    // An `import` is only legal at the top level of a module; everything else belongs in
    // the factory closure, where it is per instance.
    expect(client.imports).toEqual(["import { signal } from '@fudic/core';"]);
    expect(client.body).toEqual([
      'const open = signal(false);',
      'function toggle() { open.set(!open()); }',
    ]);
  });

  it('parses the template’s own JS into the same batch, reachable by span', () => {
    const source = wrap('@code {\n  const { a } = props<{ a: string }>();\n}\n').replace(
      '<span></span>',
      '<span>@a</span>',
    );
    const { template } = extractCode(source, componentDoc(source));
    const at = source.indexOf('@a') + 1;
    expect((template.ast({ start: at, end: at + 1 }) as { type: string }).type).toBe('Identifier');
    // A span nobody registered is not an error: it is a fragment the walk never saw, and
    // the caller reads that as "nothing declared here" rather than as a crash.
    expect(template.ast({ start: 0, end: 0 })).toEqual([]);
  });

  it('registers nothing for a degraded header, which has no text to parse', () => {
    // `@foreach` with no `(` leaves an EMPTY header span (FUD0070). Handing it to the batch
    // would register a fragment of zero characters and make the buffer say `for () {}`.
    const source = wrap('').replace('<span></span>', '<ul>@foreach const r of rows { <li></li> }</ul>');
    const { template } = extractCode(source, componentDoc(source));
    const at = source.indexOf('@foreach') + '@foreach'.length;
    expect(template.ast({ start: at, end: at })).toEqual([]);
  });

  it('reads the code of a component whose template degraded away entirely', () => {
    // FUD0157: the wrapper's child is not a `<template shadowrootmode>`, so there is no
    // template at all. `@code` is still a fact about the file and still has to come out.
    const source = '@code {\n  const { a } = props<{ a: string }>();\n}\n<m-el><span></span></m-el>\n';
    const doc = componentDoc(source);
    expect(doc.template).toBeUndefined();
    expect(extractCode(source, doc).props).toEqual([{ name: 'a' }]);
  });

  it('leaves the @server region out of the client body', () => {
    const source = wrap(
      '@code {\n' +
        '  @server { const secret = 1; }\n' +
        '  @client { const visible = 2; }\n' +
        '}\n',
    );
    const { client } = extractCode(source, componentDoc(source));
    expect(client.body).toEqual(['const visible = 2;']);
  });
});
