/**
 * `FUD0290` — the `$` prefix is the compiler's inside `@code { @client }` (SDD-15 §4.7).
 *
 * The body of `@client` is copied verbatim into the factory closure and shares one lexical
 * scope with `$dom`, `$shadow`, `$props`, `$n1`, `$m`, `$s`, `$a` and `$host`. The rule is
 * about BINDINGS, so half of these tests are about what must NOT be reported: a property
 * name, a class member, a label and a type annotation all spell an identifier and none of
 * them puts anything in that scope. An error on legal code is the failure mode that matters
 * here — the author cannot work around a diagnostic they did not earn.
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

/** A component whose `@client` region is `body`, and nothing else of note. */
const withClient = (body: string): string =>
  `@code {\n  @client {\n${body}\n  }\n}\n` +
  `<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n`;

/** The text each diagnostic points at — the span is the assertion, not the message. */
function flagged(body: string): string[] {
  const source = withClient(body);
  const { diagnostics } = extractCode(source, componentDoc(source));
  return diagnostics.map((d) => {
    expect(d.code).toBe('FUD0290');
    expect(d.severity).toBe('error');
    return source.slice(d.span.start, d.span.end);
  });
}

describe('SDD-15 §4.7 — what the $ prefix catches', () => {
  it('flags a declaration, wherever the declaration is written', () => {
    expect(flagged('    const $x = 1;\n    let $y;\n    var $z = 2;')).toEqual(['$x', '$y', '$z']);
  });

  it('flags a destructuring target and not the key it came from', () => {
    // `{ a: $b }` reads a property called `a` and declares a variable called `$b`. Only the
    // second half is a name in this scope.
    expect(flagged('    const { a: $b, $c } = o;\n    const [$d, ...$rest] = arr;')).toEqual([
      '$b',
      '$c',
      '$d',
      '$rest',
    ]);
  });

  it('flags function and class names, and their parameters', () => {
    expect(flagged('    function $f($p, { q: $r } = {}) { return $p; }\n    class $C {}')).toEqual([
      '$f',
      '$p',
      '$r',
      '$C',
    ]);
  });

  it('flags a free reference: using $shadow without declaring it IS the collision', () => {
    expect(flagged('    const n = $shadow.firstElementChild;\n    $dom.setAttr(n, "a", "b");')).toEqual([
      '$shadow',
      '$dom',
    ]);
  });

  it('reports a declaration once, not again at every use', () => {
    // The declaration is the error. Repeating it at each read would only tell the author
    // that they meant it.
    expect(flagged('    let $n = 0;\n    $n = $n + 1;\n    $n++;')).toEqual(['$n']);
  });

  it('reports a free reference at its first use, once', () => {
    expect(flagged('    const a = $props;\n    const b = $props;')).toEqual(['$props']);
  });

  it('reports in source order, whatever order the walk found them in', () => {
    expect(flagged('    const first = $a;\n    const $b = 2;\n    const third = $c;')).toEqual([
      '$a',
      '$b',
      '$c',
    ]);
  });
});

describe('SDD-15 §4.7 — what it must leave alone', () => {
  it('says nothing about a trailing $: `obs$` is the author’s', () => {
    // The reservation is the minimum that guarantees no collision: the emit only ever
    // writes the `$` first, so RxJS-style names stay legal.
    expect(flagged('    const obs$ = 1;\n    const a$b = 2;\n    console.log(obs$, a$b);')).toEqual([]);
  });

  it('says nothing about a property of somebody else’s object', () => {
    expect(flagged('    const a = o.$bar;\n    o.$baz = 1;\n    const c = o["$qux"];')).toEqual([]);
  });

  it('says nothing about an object key, but does about the value next to it', () => {
    expect(flagged('    const o = { $k: 1 };')).toEqual([]);
    // Shorthand is not a key: `{ $k }` READS a variable called `$k`.
    expect(flagged('    const o = { $k };')).toEqual(['$k']);
    // A computed key is ordinary code in the surrounding scope.
    expect(flagged('    const o = { [$k]: 1 };\n    const v = o[$k];')).toEqual(['$k']);
  });

  it('says nothing about a class member, and does about a computed one', () => {
    expect(flagged('    class C {\n      $p = 1;\n      $m() { return this.$p; }\n    }')).toEqual([]);
    expect(flagged('    class C {\n      [$k]() {}\n    }')).toEqual(['$k']);
  });

  it('says nothing about a label: `break` reads no variable', () => {
    expect(
      flagged('    $loop: for (const r of rows) {\n      if (r) continue $loop;\n      break $loop;\n    }'),
    ).toEqual([]);
  });

  it('says nothing about the exported name an import renames', () => {
    expect(flagged("    import { $exported as fine } from './m.js';")).toEqual([]);
    // The LOCAL side is a binding in this file, and that one is the author's to get right.
    expect(flagged("    import { emit as $fire } from '@fudic/dom';")).toEqual(['$fire']);
  });

  it('says nothing about a type: `x as $T` names no value', () => {
    // The region is TypeScript and the emit copies it verbatim; a type annotation is erased
    // before anything shares a scope with it.
    expect(flagged('    const a: $T = b as $T;\n    const c = 1;')).toEqual([]);
  });

  it('says nothing about the text inside a string or a comment', () => {
    // The whole reason this is decided on the AST. A lexer would report all four.
    expect(flagged('    const s = "$dom";\n    const t = `$shadow`;\n    // $props\n    /* $host */')).toEqual(
      [],
    );
  });

  it('is a rule about @client, and the neutral zone is not it', () => {
    // The neutral zone is read by the SERVER branch, which shares no closure with it.
    const source =
      '@code {\n  const $x = 1;\n}\n<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n';
    expect(extractCode(source, componentDoc(source)).diagnostics).toEqual([]);
  });
});

describe('SDD-15 §4.7 — the emit does not throw', () => {
  it('reports and carries on: the props, the signals and the body all survive', () => {
    const source =
      '@code {\n' +
      '  const { title } = props<{ title: string }>();\n' +
      '  const n = signal(1);\n' +
      '  @client {\n    const $bad = title;\n    const good = 2;\n  }\n' +
      '}\n' +
      '<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n';
    const { props, signals, client, diagnostics } = extractCode(source, componentDoc(source));
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0290']);
    expect(props).toEqual([{ name: 'title' }]);
    expect(signals).toEqual([{ name: 'n', init: '1', kind: 'signal' }]);
    expect(client.body).toEqual(['const $bad = title;', 'const good = 2;']);
  });

  it('points at the identifier, not at the statement around it', () => {
    const source = withClient('    const $x = 1;');
    const { diagnostics } = extractCode(source, componentDoc(source));
    const at = source.indexOf('$x');
    expect(diagnostics[0]!.span).toEqual({ start: at, end: at + 2 });
    expect(diagnostics[0]!.message).toContain('"$x"');
    expect(diagnostics[0]!.message).toContain('"x$"'); // the way out, spelt for the author
  });
});
