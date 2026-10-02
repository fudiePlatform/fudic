/**
 * SDD-51 — what the view may write, over the whole semantic pass.
 *
 * Three nets. `examples/vista-errores` holds every case with the code it gives written in the
 * comment above it, and the pass has to give exactly that (criterion 22; the same file is held
 * to the same comments through the editor's channel in `@fudic/typecheck`). The repo's own
 * `.fud` files have to give none of these codes (criterion 20). And the cases the example
 * cannot hold — a fragment Oxc could not parse, shapes no author writes on purpose — are
 * pinned one by one below.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/types/index.js';
import { viewDiagnostics } from './_view.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const EXAMPLE = join(ROOT, 'examples/vista-errores');

/** The codes SDD-51 reports: its range, and the `$` of the template (FUD0461). */
const OWN = /^FUD09[01]\d$|^FUD0461$/u;

const seen = (source: string, ds: readonly Diagnostic[]): readonly string[] =>
  ds.filter((d) => OWN.test(d.code)).map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`);

/** What a comment announces — the grammar of `typecheck/test/vista-errores.test.ts`. */
function announced(comment: string): readonly string[] {
  const text = comment.replace(/\s+/gu, ' ');
  const out: string[] = [];
  for (const match of text.matchAll(/(FUD\d{4}) sobre /gu)) {
    let rest = text.slice(match.index + match[0].length);
    for (;;) {
      const token = /^`([^`]+)`(?: \(×(\d+)\))?/u.exec(rest);
      if (token === null) break;
      for (let i = 0; i < Number(token[2] ?? 1); i++) out.push(`${match[1]} ${token[1]}`);
      rest = rest.slice(token[0].length);
      const separator = /^(?:, | y )/u.exec(rest);
      if (separator === null) break;
      rest = rest.slice(separator[0].length);
    }
  }
  return out;
}

describe('examples/vista-errores, case by case (criterion 22)', () => {
  for (const name of ['vista-errores.fud', 'snippets.fud']) {
    const source = readFileSync(join(EXAMPLE, name), 'utf8');
    const ds = viewDiagnostics(source);
    const comments = [...source.matchAll(/@\*([\s\S]*?)\*@/gu)];
    comments.forEach((comment, i) => {
      const from = comment.index + comment[0].length;
      const to = comments[i + 1]?.index ?? source.length;
      const line = source.slice(0, comment.index).split('\n').length;
      it(`${name}:${line}`, () => {
        const inside = ds.filter((d) => d.span.start >= from && d.span.start < to);
        const expected = announced(comment[1]!).filter((e) => OWN.test(e.split(' ')[0]!));
        expect([...seen(source, inside)].sort()).toEqual([...expected].sort());
      });
    });
  }
});

describe('the repo compiles as it did (criterion 20)', () => {
  const files = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) files(path, out);
      else if (name.endsWith('.fud') && !path.includes('vista-errores')) out.push(path);
    }
    return out;
  };
  const all = [...files(join(ROOT, 'packages')), ...files(join(ROOT, 'examples'))];

  it('finds the corpus', () => {
    expect(all.length).toBeGreaterThan(130);
  });
  for (const path of all) {
    it(path.slice(ROOT.length).split('\\').join('/'), () => {
      const source = readFileSync(path, 'utf8');
      expect(seen(source, viewDiagnostics(source))).toEqual([]);
    });
  }
});

/** A component with a `@code` and a template; what SDD-51 says about it, `CODE text` each. */
function view(template: string, code = ''): readonly string[] {
  const source =
    '@code {\n  let total = 0;\n  let cur: { next: unknown } | null = null;\n  let i2 = 0;\n  const s = [1];\n' +
    '  const o = { k: 1, list: [1], stack: "" };\n  const k = "k";\n  const f = () => true;\n' +
    `  @client { let deCliente2 = 1; }\n${code}}\n` +
    `<x-a><template shadowrootmode="open">${template}</template></x-a>`;
  return seen(source, viewDiagnostics(source));
}

describe('the shapes the example does not hold (§3.8)', () => {
  it('an object chain in parentheses still hangs from its root', () => {
    expect(view('<p>@((o?.list).sort().length)</p>')).toEqual(['FUD0911 sort']);
  });

  it('a loop that always runs and never breaks, and one that breaks', () => {
    expect(view('@{ while ({}) {} }')).toEqual(['FUD0913 while']);
    expect(view('@{ for (;;) { break; } }')).toEqual([]);
  });

  it('a @while ends when its body writes what it reads, by any path to the name', () => {
    expect(view('@while ([cur][0]) key (1) { @{ cur = null; } }')).toEqual([]);
    expect(view('@while (cur?.next) key (1) { @{ cur = null; } }')).toEqual([]);
    expect(view('@while (o[k]) key (1) { <i>x</i> }')).toEqual(['FUD0913 o[k]']);
    expect(view('@while (f()) key (1) { <i>x</i> }')).toEqual([]);
    expect(view('@{ i2 = 0; } @while (i2 < 3) key (i2) { @{ i2++; } }')).toEqual([]);
  });

  it('holes, computed calls and shadowed names are not what they look like', () => {
    expect(view('<p>@([, 1].length)</p>')).toEqual([]);
    expect(view('<p>@(String(o[k])) @(String(o[k]()))</p>')).toEqual([]);
    expect(view('<p>@(s.map((Symbol) => Symbol()).length)</p>')).toEqual([]);
    expect(view('<p>@(s.toString())</p>')).toEqual([]);
  });

  it('Array(n), Date and Intl by their arguments', () => {
    expect(view('<p>@(Array(3).length) @(Array(1, 2).length) @(Array().length)</p>')).toEqual([]);
    expect(view('<p>@(Array(...s).length)</p>')).toEqual(['FUD0913 Array']);
    expect(view('<p>@(new Date(0).toISOString()) @(Intl.NumberFormat("es").format(1))</p>')).toEqual([]);
    expect(view('<p>@(Date(0))</p>')).toEqual(['FUD0912 Date(0)']);
  });

  it('what the pass built may be mutated; Object.x with nothing to write is no write', () => {
    expect(view('@{ const lista: number[] = []; } <p>@(lista.push(1))</p>')).toEqual([]);
    expect(view('<p>@(String(Object.freeze()))</p>')).toEqual([]);
  });

  it('the reflective statics, read as a member or called', () => {
    expect(view('<p>@(String(Symbol.for))</p>')).toEqual(['FUD0910 for']);
    expect(view('<p>@(String(Object.setPrototypeOf(o, null)))</p>')).toEqual(['FUD0910 setPrototypeOf']);
  });

  it('every shape of a @for header', () => {
    expect(view('@for (; total < 3; ) key (total) { <i>x</i> }')).toEqual([]);
    expect(view('@for (let [i = 0] = s; i < 3; i++) key (i) { <i>x</i> }')).toEqual([]);
    expect(view('@for (let i = 0; i < 3; i = i + 1) key (i) { <i>x</i> }')).toEqual([]);
    expect(view('@for (let i = 0; i < 3; f()) key (i) { <i>x</i> }')).toEqual([]);
    expect(view('@for (f(); total < 3; total++) key (total) { <i>x</i> }')).toEqual(['FUD0900 total++']);
  });

  it('every shape of an @{ } statement', () => {
    expect(view('@{ for (total = 0; total < 3; total++) {} }')).toEqual([]);
    expect(view('@{ for (total of s) {} }')).toEqual([]);
    expect(view('@{ ; type T = number; interface I { a: T } }')).toEqual([]);
    expect(view('@{ await using r = o; }')).toEqual(['FUD0902 await using']);
    expect(view('@{ if (total) { total = 1; } }')).toEqual([]);
    expect(view('@{ let q = 0; } @{ q = 1; }')).toEqual([]);
  });

  it('every shape of a destructuring write, leaf by leaf', () => {
    expect(view('@{ let q2 = 0; let r2 = {}; ({ k: total, [k]: q2, ...r2 } = o); }')).toEqual([]);
    expect(view('@{ let q2 = 0; let r2: number[] = []; [total, , q2 = 1, ...r2] = s; }')).toEqual([]);
    expect(view('@{ ({ k: s } = o); }')).toEqual(['FUD0901 s']);
  });

  it('a write that reads its own value accumulates, through any expression', () => {
    expect(view('@{ total = [total].length; }')).toEqual(['FUD0900 total']);
  });

  it('a handler reads the names of the view, the $ ones aside', () => {
    expect(view('<b @click=@(() => noExiste)>x</b>')).toEqual(['FUD0907 noExiste']);
    expect(view('<b @click=@(() => deCliente2 + total)>x</b>')).toEqual([]);
  });

  it('a .prop takes a @client callback by name, and is a value otherwise', () => {
    expect(view('<x-b .v=@deCliente2></x-b>')).toEqual([]);
    expect(view('<x-b .v=@(deCliente2 + 1)></x-b>')).toEqual(['FUD0907 deCliente2']);
  });

  it('the attributes by their values', () => {
    expect(view('<a href="data:text/html,x">x</a><img alt="" src="data:image/png,x">')).toEqual([
      'FUD0915 href',
    ]);
    expect(view('<svg><animate attributeName=@k></animate></svg>')).toEqual([]);
  });

  it('a @code export with no name, and one that names what it exports', () => {
    expect(view('<p>@total</p>', '  export default function () {}\n  export { k };\n')).toEqual([]);
  });
});

describe('several faults, several diagnostics (criterion 14)', () => {
  it('gives the three', () => {
    const source = '<x-a><template shadowrootmode="open"><p>@(a++)</p><p>@(window)</p>@{ return; }</template></x-a>';
    const codes = viewDiagnostics(source).map((d) => d.code);
    expect(codes).toContain('FUD0900');
    expect(codes).toContain('FUD0907');
    expect(codes).toContain('FUD0908');
  });
});
