/**
 * `@code` extraction (Oxc) — the prop-default and inert-signal reading that feeds the
 * component module. Covers the shapes the home fixtures do not exercise (a prop with no
 * default, `signal()` with no initial, a non-{props,signal} declaration, rest/spread in
 * the pattern, and no `@code` at all), so the extraction's branches stay honest.
 */
import { describe, expect, it } from 'vitest';
import { extractCode } from '../../src/emit/oxc-code.js';
import type { ComponentDocument } from '../../src/document/index.js';
import { bareProps, bareSignals, parse } from './_support.js';

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
    // 'a' has no default; neither key of `T` carries a `?`, so neither is optional
    expect(bareProps(props)).toEqual([
      { name: 'a', optional: false },
      { name: 'b', def: '2', optional: false },
    ]);
    // The span is the property inside the `{ … }`, default included (SDD-40).
    expect(source.slice(props[0]!.at.start, props[0]!.at.end)).toBe('a');
    expect(source.slice(props[1]!.at.start, props[1]!.at.end)).toBe('b = 2');
    // `at` is where the CALL starts and `span` is the whole declarator; each is checked on
    // its own below. What this case is about is the name and the initial.
    expect(bareSignals(signals)).toEqual([
      { name: 's', init: 'undefined', kind: 'signal' }, // no argument
      { name: 't', init: '5', kind: 'signal' },
    ]);
    expect(source.slice(signals[1]!.span.start, signals[1]!.span.end)).toBe('t = signal(5)');
  });

  it('BUG-24 §4.4 — a reactive carries where its CALL starts, for the cell splice', () => {
    const source = wrap('@code {\n  @client { const n = signal(7); }\n}\n');
    const [reactive] = extractCode(source, componentDoc(source)).signals;
    expect(source.slice(reactive!.at)).toMatch(/^signal\(7\)/u);
  });

  it('SDD-31 §4.7 — a `computed` is a reactive name too, tagged by kind', () => {
    const source = wrap(
      '@code {\n  const a = signal(1);\n  const total = computed(() => a() * 2);\n  const t = computed();\n}\n',
    );
    expect(bareSignals(extractCode(source, componentDoc(source)).signals)).toEqual([
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
    expect(bareProps(props)).toEqual([{ name: 'a', optional: false }]);
    expect(bareSignals(signals)).toEqual([{ name: 't', init: '1', kind: 'signal' }]);
  });

  it('SDD-31 §5 — `computed` and `batch` in the neutral zone say nothing', () => {
    const source = wrap('@code {\n  const t = computed(() => 1);\n  batch(() => {});\n}\n');
    expect(extractCode(source, componentDoc(source)).diagnostics).toEqual([]);
  });

  it('skips rest/spread in the props pattern', () => {
    const source = wrap('@code {\n  const { a, ...rest } = props<{ a: string }>();\n}\n');
    expect(bareProps(extractCode(source, componentDoc(source)).props)).toEqual([
      { name: 'a', optional: false },
    ]);
  });

  // BUG-23 task 16: the `?` of `T` is the only thing that makes a prop optional, and «cannot
  // be read» has to land on the same side as «optional» — a build invents no error it cannot
  // demonstrate (§4.4).
  describe('Prop.optional — read off the type argument of props<T>()', () => {
    const optionals = (code: string): Record<string, boolean> => {
      const source = wrap(`@code {\n  ${code}\n}\n`);
      return Object.fromEntries(
        extractCode(source, componentDoc(source)).props.map((p) => [p.name, p.optional]),
      );
    };

    it('a `?` makes it optional and its absence makes it required', () => {
      expect(optionals('const { a, b } = props<{ a: string; b?: number }>();')).toEqual({
        a: false,
        b: true,
      });
    });

    it('a type argument that is not a type literal proves nothing: all optional', () => {
      expect(optionals('const { a } = props<Foo>();')).toEqual({ a: true });
    });

    it('no type argument at all proves nothing either', () => {
      expect(optionals('const { a } = props();')).toEqual({ a: true });
    });

    it('a member that is not a plain property signature declares no key', () => {
      expect(optionals('const { a } = props<{ [k: string]: string }>();')).toEqual({ a: true });
    });

    it('a key that is not an identifier is not a key this can match', () => {
      expect(optionals(`const { a } = props<{ 'a': string }>();`)).toEqual({ a: true });
    });

    it('resolves a name the file DECLARES, as a type alias or as an interface', () => {
      // Both spell the same contract, so both have to read the same. An interface keeps its
      // members one level deeper, in its `body`, and that is the only difference between them.
      expect(optionals('type P = { a: string; b?: number };\n  const { a, b } = props<P>();')).toEqual(
        { a: false, b: true },
      );
      expect(
        optionals('interface P { a: string; b?: number }\n  const { a, b } = props<P>();'),
      ).toEqual({ a: false, b: true });
      expect(
        optionals('export interface P { a: string }\n  const { a } = props<P>();'),
      ).toEqual({ a: false });
    });

    it('proves nothing from a name built out of another type', () => {
      // `Omit<…>`, a union, a generic: resolving those is typechecking, and this pass reads an
      // AST. Unknown has to keep meaning «all optional», never an invented requirement.
      expect(optionals('type P = Omit<Q, "x">;\n  const { a } = props<P>();')).toEqual({ a: true });
    });
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
    expect(client.body.map((s) => s.text)).toEqual([
      'const open = signal(false);',
      'function toggle() { open.set(!open()); }',
    ]);
    // Each statement knows where it came from: the cell splice of BUG-24 §4.4 writes into it
    // by offset, and an offset only means anything against the file it was read from.
    expect(client.body.map((s) => source.slice(s.at, s.at + s.text.length))).toEqual(
      client.body.map((s) => s.text),
    );
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
    expect(bareProps(extractCode(source, doc).props)).toEqual([{ name: 'a', optional: false }]);
  });

  it('finds every emit(...) of @client, whatever the binding is called (SDD-15 §4.4)', () => {
    const source = wrap(
      '@code {\n' +
        '  @client {\n' +
        "    import { emit as fire } from '@fudic/dom';\n" +
        '    function press() { console.log(1); helper(); fire(); }\n' +
        "    const later = () => { const f = () => fire('press', 1); return f; };\n" +
        '  }\n' +
        '}\n',
    );
    const { emitCalls } = extractCode(source, componentDoc(source));
    // Both calls, however deep the second one sits — and each one knows where `.call` and
    // `$host` go: `fire()` has no argument to insert before, `fire('press', 1)` has.
    expect(emitCalls).toHaveLength(2);
    const text = (at: number): string => source.slice(at, at + 8);
    const [first, second] = emitCalls as [(typeof emitCalls)[0], (typeof emitCalls)[0]];
    expect(first.hasArgs).toBe(false);
    expect(source.slice(first.calleeEnd - 4, first.calleeEnd)).toBe('fire');
    expect(source[first.hostAt]).toBe(')');
    expect(second.hasArgs).toBe(true);
    expect(text(second.hostAt)).toBe("'press',");
  });

  it('finds nothing when emit is not the one imported from @fudic/dom', () => {
    const source = wrap(
      '@code {\n' +
        '  @client {\n' +
        "    import { browserDom } from '@fudic/dom';\n" +
        "    import * as dom from '@fudic/dom';\n" +
        "    import { emit } from './my-bus';\n" +
        '    function press() { emit("press"); dom.emit("press"); }\n' +
        '  }\n' +
        '}\n',
    );
    // A raw `dispatchEvent`, an `emit` of the author's own, and a namespace import: none of
    // them is the bus primitive, and none is rewritten. We do not protect what we cannot see.
    expect(extractCode(source, componentDoc(source)).emitCalls).toEqual([]);
  });

  it('leaves the @server region out of the client body', () => {
    const source = wrap(
      '@code {\n' +
        '  @server { const secret = 1; }\n' +
        '  @client { const visible = 2; }\n' +
        '}\n',
    );
    const { client } = extractCode(source, componentDoc(source));
    expect(client.body.map((s) => s.text)).toEqual(['const visible = 2;']);
  });
});

/**
 * The two injection diagnostics ONE `@code` settles by itself (SDD-38 §6.23, §6.25).
 *
 * Neither needs a graph, a filesystem or an ancestor: they are about a region contradicting
 * itself, and the answer is in the same twenty lines the author is looking at. The other
 * three of the five need more than this file and live in `di-diagnostics.ts`.
 */
describe('the injection diagnostics of one @code', () => {
  const DI = "  import { inject, provide } from '@fudic/di';\n  import { Cart, Clock } from './services';\n";

  /** The diagnostic codes a `@code` body produces, in order. */
  const codesOf = (body: string): readonly string[] => {
    const source = wrap(`@code {\n${DI}${body}}\n`);
    return extractCode(source, componentDoc(source)).diagnostics.map((d) => d.code);
  };

  it('FUD0684 — the same provider registered twice, pointing at the second one', () => {
    const body = '  provide(Cart, () => new Cart());\n  provide(Cart, () => new Cart());\n';
    const source = wrap(`@code {\n${DI}${body}}\n`);
    const { diagnostics } = extractCode(source, componentDoc(source));

    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0684']);
    // The SECOND registration is the one reported: the first is the one that stood until it
    // was written, and pointing at it would name the line that was not the mistake.
    const second = source.lastIndexOf('Cart, () => new Cart()');
    expect(diagnostics[0]!.span).toEqual({ start: second, end: second + 'Cart'.length });
  });

  it('FUD0684 — a second registration counts wherever it is written', () => {
    // Neutral and `@client` are two zones of ONE module in the browser, so the second call
    // overwrites the first there exactly as two neighbouring lines would.
    expect(
      codesOf('  provide(Cart, () => new Cart());\n  @client {\n    provide(Cart, () => new Cart());\n  }\n'),
    ).toEqual(['FUD0684']);
  });

  it('says nothing about two DIFFERENT providers, or about a call with no argument', () => {
    // `provide()` is a mistake TypeScript reports, and inventing a second diagnostic over an
    // argument that is not there would only name the same line twice.
    expect(
      codesOf('  provide(Cart, () => new Cart());\n  provide(Clock, () => new Clock());\n  provide();\n  provide();\n'),
    ).toEqual([]);
  });

  it('FUD0682 — provided in @server, injected in @client', () => {
    const body =
      '  @server {\n    provide(Cart, () => new Cart());\n  }\n' +
      '  @client {\n    const cart = inject(Cart);\n  }\n';
    const source = wrap(`@code {\n${DI}${body}}\n`);
    const { diagnostics } = extractCode(source, componentDoc(source));

    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0682']);
    expect(diagnostics[0]!.message).toContain('@server');
    const at = source.indexOf('inject(Cart)') + 'inject('.length;
    expect(diagnostics[0]!.span).toEqual({ start: at, end: at + 'Cart'.length });
  });

  it('FUD0682 — and the symmetric one, provided in @client and injected in @server', () => {
    const codes = codesOf(
      '  @client {\n    provide(Cart, () => new Cart());\n  }\n' +
        '  @server {\n    const cart = inject(Cart);\n  }\n',
    );
    expect(codes).toEqual(['FUD0682']);
  });

  it('says nothing when the provider is neutral: that zone runs on both sides', () => {
    // Which is the whole answer the diagnostic proposes, so it had better not report it.
    expect(
      codesOf(
        '  provide(Cart, () => new Cart());\n' +
          '  @client {\n    const a = inject(Cart);\n  }\n' +
          '  @server {\n    const b = inject(Cart);\n  }\n',
      ),
    ).toEqual([]);
  });

  it('says nothing when the two are in the same zone, or when the injection is neutral', () => {
    expect(
      codesOf(
        '  @client {\n    provide(Cart, () => new Cart());\n    const a = inject(Cart);\n  }\n' +
          '  const b = inject(Cart);\n',
      ),
    ).toEqual([]);
  });

  it('says nothing about injecting what this @code does not provide at all', () => {
    // An ancestor's or a `@Service`'s, and whether anybody registers it is FUD0680's
    // question — asked of the graph, with the module next door open.
    expect(codesOf('  @client {\n    const cart = inject(Cart);\n  }\n')).toEqual([]);
  });

});
