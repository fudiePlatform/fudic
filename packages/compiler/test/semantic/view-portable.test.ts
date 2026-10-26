/**
 * SDD-61 — what the portable view may write, over the whole semantic pass.
 *
 * Criteria 2–5, 11, 12, 16–18 and 38 (the part without types), each code on its exact span
 * and one per node. The typed half — a call with no arguments that reads nothing reactive, a
 * condition that is not a boolean, a type that does not port — is `@fudic/typecheck`'s.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/semantic/index.js';
import { viewInput } from './_view.js';

/** The codes the view analyzers report: SDD-51's range, the `$` of the template, SDD-61's. */
const OWN = /^FUD09[01]\d$|^FUD0461$|^FUD114\d$|^FUD115[0-3]$/u;

/** The forms the cases read come from a linked `.fudapi`, as an app's do (SDD-60 §3.14). */
const FORMS = { data: false, names: new Set(['form', 'campo']) };

/** What every case can read: the catalogue, a few values, functions and reactive ones. */
const CODE = `
  import { signal, computed, now } from '@fudic/core';
  import { t } from '@fudic/i18n';
  import { now as ahora, "otro" as otro } from './reloj.ts';
  import reloj from './reloj.ts';
  let total = 0;
  let cur: { next: unknown } | null = null;
  const xs = [{ ok: true, n: 1 }];
  const s = 'a';
  const a = 1;
  const b = 2;
  const x = 1;
  const o = { k: 1 };
  const k = 'k';
  const pares = [{ a: 1 }];
  const articulo = { titulo: 'a', autor: 'b', resumen: 'c' };
  const count = signal(0);
  function formatea(v: number) { return String(v); }
  const esValida = (v: { ok: boolean }) => v.ok;
  const { label, ...props } = { label: 'l', title: 't' };
`;

function source(template: string, code = ''): string {
  return `@code {${CODE}${code}}\n<x-a><template shadowrootmode="open">${template}</template></x-a>`;
}

/** What the portable view says about `template`, `CODE text` each, sorted. */
function portable(template: string, code = ''): readonly string[] {
  const text = source(template, code);
  const ds = analyze({ ...viewInput(text), apis: FORMS }).diagnostics;
  return ds
    .filter((d) => OWN.test(d.code))
    .map((d) => `${d.code} ${text.slice(d.span.start, d.span.end)}`)
    .sort();
}

describe('calls (criterion 2, §3.3)', () => {
  it('a call that is not a reactive read is FUD1140, on the callee', () => {
    expect(portable('<p>@(xs.find(x => x.ok))</p>')).toEqual(['FUD1140 xs.find']);
    expect(portable('<p>@(total.toFixed(2))</p>')).toEqual(['FUD1140 total.toFixed']);
    expect(portable('<p>@(formatea(1))</p>')).toEqual(['FUD1140 formatea']);
    expect(portable('<p>@(String(a))</p>')).toEqual(['FUD1140 String']);
    expect(portable('<p>@(f?.())</p>', 'const f = count;')).toEqual(['FUD1140 f']);
    expect(portable('<p>@(t("x"))</p>')).toEqual(['FUD1140 t']);
    expect(portable('<p>@((a || b)())</p>')).toEqual(['FUD1140 (a || b)']);
  });

  it('a read of a reactive value, and t() as the value of a prop, are not', () => {
    expect(portable('<p>@count() @(form.$valid()) @campo.errors()</p>')).toEqual([]);
    expect(portable('<x-b .label=@(t("Hola"))></x-b>')).toEqual([]);
    expect(portable('<x-b .label=@(t("Hola {n}", { n: a, b }))></x-b>')).toEqual([]);
  });

  it('the holes object of t() holds plain properties only', () => {
    expect(portable('<x-b .label=@(t("x", { [k]: a, ...o, m() { return 1; } }))></x-b>')).toEqual([
      'FUD1143 ...o',
      'FUD1143 [k]: a',
      'FUD1143 m() { return 1; }',
    ]);
  });

  it('an optional call of t() on a prop is no translation', () => {
    expect(portable('<x-b .label=@(t?.("x"))></x-b>')).toEqual(['FUD1140 t']);
  });

  it('type arguments on a call are TypeScript syntax', () => {
    expect(portable('<p>@(count<number>())</p>')).toEqual(['FUD1144 <number>']);
  });
});

describe('new and globals (criterion 3, §3.2)', () => {
  it('new is FUD1141, on `new` and its callee', () => {
    expect(portable('<p>@(new Date())</p>')).toEqual(['FUD1141 new Date']);
  });

  it('a global other than undefined is FUD0907, on the name', () => {
    expect(portable('<p>@(Math.max(a, b))</p>')).toEqual(['FUD0907 Math']);
    expect(portable('<p>@(JSON.stringify(o))</p>')).toEqual(['FUD0907 JSON']);
    expect(portable('<p>@(NaN)</p>')).toEqual(['FUD0907 NaN']);
    expect(portable('<p>@(a === undefined)</p>')).toEqual([]);
  });
});

describe('operators (criterion 4, §3.4)', () => {
  it('an operator that does not port is FUD1142, on the operator', () => {
    expect(portable('<p>@(a == b)</p>')).toEqual(['FUD1142 ==']);
    expect(portable('<p>@(typeof a)</p>')).toEqual(['FUD1142 typeof']);
    expect(portable('<p>@(k in o)</p>')).toEqual(['FUD1142 in']);
    expect(portable('<p>@(a ** 2)</p>')).toEqual(['FUD1142 **']);
    expect(portable('<p>@(a & b)</p>')).toEqual(['FUD1142 &']);
    expect(portable('<p>@(+a)</p>')).toEqual(['FUD1142 +']);
  });

  it('the portable ones are not', () => {
    expect(portable('<p>@(a % b) @(-a) @(a ?? "—") @(!(a < b) && a >= b ? a : b) @(a | k)</p>')).toEqual([]);
  });

  it('delete is a write', () => {
    expect(portable('<p>@(delete o.k)</p>')).toEqual(['FUD0900 delete o.k']);
  });
});

describe('literals and TypeScript (criterion 5, §3.2)', () => {
  it('object and array literals, bigint and lone surrogates are FUD1143', () => {
    expect(portable('<p>@([1, 2])</p>')).toEqual(['FUD1143 [1, 2]']);
    expect(portable('<x-b .x=@({ a: 1 })></x-b>')).toEqual(['FUD1143 { a: 1 }']);
    expect(portable('<p>@(10n)</p>')).toEqual(['FUD1143 10n']);
    expect(portable('<p>@("\\uD800")</p>')).toEqual(['FUD1143 "\\uD800"']);
    expect(portable('<p>@("😀" + `a${s}b`)</p>')).toEqual([]);
  });

  it('as, satisfies, !, <T>x and f<T> are FUD1144, on the syntax only', () => {
    expect(portable('<p>@(x as string)</p>')).toEqual(['FUD1144 as string']);
    expect(portable('<p>@(x satisfies number)</p>')).toEqual(['FUD1144 satisfies number']);
    expect(portable('<p>@(x!)</p>')).toEqual(['FUD1144 !']);
    expect(portable('<p>@(<number>x)</p>')).toEqual(['FUD1144 <number>']);
    expect(portable('<p>@(formatea<number>)</p>')).toEqual(['FUD1144 <number>']);
  });

  it('a regex literal is FUD0919', () => {
    expect(portable('<p>@(/a/.source)</p>')).toEqual(['FUD0919 /a/']);
  });
});

describe('what SDD-51 already refused, through the new walk', () => {
  it('code, writes, asynchrony, modules, context and the comma', () => {
    expect(portable('<p>@(() => 1)</p>')).toEqual(['FUD0905 () => 1']);
    expect(portable('<p>@(function () { return 1; })</p>')).toEqual(['FUD0905 function () { return 1; }']);
    expect(portable('<p>@(class {})</p>')).toEqual(['FUD0905 class {}']);
    expect(portable('<p>@(s.raw`x`)</p>')).toEqual(['FUD0905 s.raw']);
    expect(portable('<p>@(a = 1)</p>')).toEqual(['FUD0900 a = 1']);
    expect(portable('<p>@(await a)</p>')).toEqual(['FUD0902 await a']);
    expect(portable('<p>@(import.meta)</p>')).toEqual(['FUD0903 import.meta']);
    expect(portable('<p>@(import("x"))</p>')).toEqual(['FUD0903 import("x")']);
    expect(portable('<p>@(this)</p>')).toEqual(['FUD0904 this']);
    expect(portable('<p>@(arguments)</p>')).toEqual(['FUD0904 arguments']);
    expect(portable('<p>@((a, b))</p>')).toEqual(['FUD0906 a, b']);
  });

  it('the machinery and a stack trace are no fields of data', () => {
    expect(portable('<p>@(o.constructor) @(o.stack)</p>')).toEqual(['FUD0910 constructor', 'FUD0917 stack']);
    expect(portable('<p>@(o[k]) @(o?.k)</p>')).toEqual([]);
  });

  it('now() in the view is FUD0912; a now() of another module, or a shadowed one, is just a name', () => {
    expect(portable('<p>@(now())</p>')).toEqual(['FUD0912 now()']);
    expect(portable('<p>@(ahora()) @otro() @reloj()</p>')).toEqual([]);
    expect(portable('<p>@(xs.map(now => now()).length)</p>')).toEqual([]);
  });

  it('a method of a local name with arguments is a call, not an unknown name', () => {
    expect(portable('<p>@(xs.map(v => v.f(1)).length)</p>')).toEqual(['FUD1140 v.f']);
  });
});

describe('collection operations (criterion 38, §3.5 bis)', () => {
  it('the recipe compiles', () => {
    expect(
      portable(
        '<p>@(xs.filter(x => x.ok).length) @(xs.map((x, i) => x.n + i).reduce((acc, n) => acc + n, 0))</p>' +
          '<p>@(xs.toSorted((p, q) => p.n - q.n)[0]?.n) @(xs.filter((x, i) => i < 3).length)</p>' +
          '<p>@(xs.reduce((acc, x, i) => i === 0 ? s : `${acc}, ${s}`, ""))</p>',
      ),
    ).toEqual([]);
  });

  it('the other methods are FUD1140', () => {
    expect(portable('<p>@(xs.some(x => x.ok))</p>')).toEqual(['FUD1140 xs.some']);
    expect(portable('<p>@(xs.join(", "))</p>')).toEqual(['FUD1140 xs.join']);
    expect(portable('<p>@(xs.filter?.(x => x.ok))</p>')).toEqual(['FUD1140 xs.filter']);
  });

  it('a form that does not port is FUD1145, on the culprit', () => {
    expect(portable('<p>@(xs.reduce((s, x) => s + x.n))</p>')).toEqual(['FUD1145 xs.reduce((s, x) => s + x.n)']);
    expect(portable('<p>@(xs.filter(x => { return x.ok; }))</p>')).toEqual(['FUD1145 x => { return x.ok; }']);
    expect(portable('<p>@(xs.filter(esValida))</p>')).toEqual(['FUD1145 esValida']);
    expect(portable('<p>@(xs.map((x, i, lista) => x))</p>')).toEqual(['FUD1145 lista']);
    expect(portable('<p>@(xs.filter(x => x.ok, o))</p>')).toEqual(['FUD1145 o']);
    expect(portable('<p>@(xs.filter(...xs))</p>')).toEqual(['FUD1145 ...xs']);
    expect(portable('<p>@(xs.filter(async x => x.ok))</p>')).toEqual(['FUD1145 async x => x.ok']);
    expect(portable('<p>@(xs.map(({ n }) => n))</p>')).toEqual(['FUD1145 { n }']);
  });

  it('what the arrow returns follows the same list', () => {
    expect(portable('<p>@(xs.map(x => ({ a: x })))</p>')).toEqual(['FUD1143 { a: x }']);
    expect(portable('<p>@(xs.map((x: number) => x))</p>')).toEqual(['FUD1144 : number']);
  });
});

describe('destructuring and rest (criteria 11 and 12, §3.6)', () => {
  it('an array pattern and a computed key are FUD1146', () => {
    expect(portable('@foreach (const [p, q] of pares) key (p) { <i>@q</i> }')).toEqual(['FUD1146 [p, q]']);
    expect(portable('@{ const { [k]: v } = o; }')).toEqual(['FUD1146 [k]: v']);
  });

  it('a rest is read by field, spread on a tag or destructured again', () => {
    expect(
      portable(
        '@{ const { titulo, ...resto } = articulo; }<p>@resto.autor</p><x-ficha ...resto></x-ficha>' +
          '@{ const { autor, ...r2 } = resto; }<p>@r2.resumen @titulo @autor</p>',
      ),
    ).toEqual([]);
    expect(portable('<p>@props.title</p><input ...props>')).toEqual([]);
  });

  it('any other use of a rest is FUD1147, on the use', () => {
    expect(portable('@{ const { titulo, ...resto } = articulo; }<x-b .datos=@resto></x-b><p>@(resto)</p>')).toEqual([
      'FUD1147 resto',
      'FUD1147 resto',
    ]);
    expect(portable('<p>@(props === o)</p>')).toEqual(['FUD1147 props']);
    expect(portable('@foreach (const { a: n, ...r } of pares) key (n) { <i>@(r)</i> }')).toEqual(['FUD1147 r']);
  });

  it('a name that shadows a rest is no rest', () => {
    expect(portable('<p>@(xs.map(props => props).length)</p>')).toEqual([]);
  });
});

describe('@{ } (criterion 17, §3.7)', () => {
  it('declares and reassigns', () => {
    expect(portable('@{ const { a: p } = o; let n = 0; n += 1; n++; n = n * 2; let m = 1, w = 2, z; ; }')).toEqual([]);
    expect(portable('@{ let p = 0; } <i>x</i> @{ p = 1; }')).toEqual([]);
  });

  it('using disposes, and await using waits', () => {
    expect(portable('@{ using r = o; }')).toEqual(['FUD0908 using']);
    expect(portable('@{ await using r = o; }')).toEqual(['FUD0902 await using']);
  });

  it('a conditional, a loop, a block or a call is FUD0908', () => {
    expect(portable('@{ if (a) { } }')).toEqual(['FUD0908 if']);
    expect(portable('@{ for (const v of xs) { } }')).toEqual(['FUD0908 for']);
    expect(portable('@{ formatea(1); }')).toEqual(['FUD0908 formatea(1)']);
    expect(portable('@{ { } }')).toEqual(['FUD0908 {']);
    expect(portable('@{ a; }')).toEqual(['FUD0908 a']);
    expect(portable('@{ var v = 1; }')).toEqual(['FUD0908 var']);
    expect(portable('@{ fin: a; }')).toEqual(['FUD0908 fin']);
  });

  it('code and types are what they are', () => {
    expect(portable('@{ function g() {} }')).toEqual(['FUD0905 function g() {}']);
    expect(portable('@{ type T = number; }')).toEqual(['FUD1144 type T = number;']);
    expect(portable('@{ const v: number = 1; }')).toEqual(['FUD1144 : number']);
  });

  it('a write lands on a variable the template owns', () => {
    expect(portable('@{ o.k = 1; }')).toEqual(['FUD0900 o.k']);
    expect(portable('@{ a = 2; }')).toEqual(['FUD0901 a']);
    expect(portable('@{ total += 1; }')).toEqual(['FUD0900 total']);
    expect(portable('@{ total = 0; total += 1; }')).toEqual([]);
    expect(portable('@{ let p = 0; let q = 0; ({ k: p, ...q } = o); ({ k: p = 1 } = o); }')).toEqual([]);
    expect(portable('@{ let p = 0; [p] = xs; }')).toEqual(['FUD1146 [p]']);
    expect(portable('@{ let p = 0; p **= 2; }')).toEqual(['FUD1142 **=']);
    expect(portable('@{ const $v = 1; const a = 2; }')).toEqual(['FUD0461 $v', 'FUD0918 a']);
  });
});

describe('@for, @while and @switch (criterion 18, §3.7)', () => {
  it('a @for steps its own names', () => {
    expect(portable('@for (let i = 0; i < count(); i++) key (i) { <i>@i</i> }')).toEqual([]);
    expect(portable('@for (let i = 0, j = 1; ; i += j) key (i) { <i>@i</i> }')).toEqual([]);
    expect(portable('@for (let i = 0; i < 3; i = i + 1) key (i) { <i>@i</i> }')).toEqual([]);
    expect(portable('@for (let i = 0; i < 3; total++) key (i) { <i>@i</i> }')).toEqual(['FUD0900 total++']);
    expect(portable('@for (let i = 0; i < 3; i *= 2) key (i) { <i>@i</i> }')).toEqual(['FUD1142 *=']);
    expect(portable('@for (total = 0; total < 3; a) key (a) { <i>x</i> }')).toEqual(['FUD0900 total = 0']);
    expect(portable('@for (var i = 0; i < 3; i++) key (i) { <i>x</i> }')).toEqual(['FUD0908 var']);
    expect(portable('@for (let i, j = 0; j < 3; j++) key (i) { <i>@i</i> }')).toEqual([]);
    expect(portable('@for (; total < 3; ) key (total) { <i>x</i> }')).toEqual([]);
  });

  it('a @foreach declares, and its own way of writing elsewhere is a write', () => {
    expect(portable('@foreach (cur of xs) key (1) { <i>x</i> }')).toEqual(['FUD0900 cur']);
    expect(portable('@foreach (var v of xs) key (v) { <i>x</i> }')).toEqual(['FUD0908 var']);
    expect(portable('@foreach (const { ok = false } of xs) key (ok) { <i>@ok</i> }')).toEqual([]);
  });

  it('signal-while.fud of examples/basic compiles', () => {
    const path = fileURLToPath(new URL('../../../../examples/basic/src/components/signal-while.fud', import.meta.url));
    const text = readFileSync(path, 'utf8');
    const ds = analyze({ ...viewInput(text) }).diagnostics.filter((d) => OWN.test(d.code));
    expect(ds).toEqual([]);
  });

  it('a @while ends when its body writes what it reads; a call does not end it', () => {
    expect(portable('@{ cur = null; } @while (cur !== null) key (1) { @{ cur = null; } }')).toEqual([]);
    expect(portable('@while (count() > 0) key (1) { <i>x</i> }')).toEqual(['FUD0913 count() > 0']);
    expect(portable('@while (true) key (1) { @{ total = 1; } }')).toEqual(['FUD0913 true']);
  });

  it('a case matches a literal (FUD1148)', () => {
    expect(portable('@switch (a) { case b: <i>x</i> }')).toEqual(['FUD1148 b']);
    expect(portable('@switch (a) { case 1 + 1: <i>x</i> }')).toEqual(['FUD1148 1 + 1']);
    expect(portable('@switch (a) { case !a: <i>x</i> }')).toEqual(['FUD1148 !a']);
    expect(portable('@switch (a) { case -k: <i>x</i> }')).toEqual(['FUD1148 -k']);
    expect(portable('@switch (a) { case -"a": <i>x</i> }')).toEqual(['FUD1148 -"a"']);
    expect(portable('@switch (a) { case /a/: <i>x</i> }')).toEqual(['FUD1148 /a/']);
    expect(portable('@switch (a) { case 1: <i>x</i> case -1: <i>y</i> case "a": <i>z</i> default: <i>w</i> }')).toEqual([]);
    expect(portable('@switch (a) { case 10n: <i>x</i> }')).toEqual(['FUD1143 10n']);
  });
});

describe('handlers and callbacks (§3.11)', () => {
  it('are full TypeScript, and read no name an @{ } declared', () => {
    expect(portable('<button @click=@(() => count.set(Math.max(0, count() - 1)))>x</button>')).toEqual([]);
    expect(portable('<x-b .onSave=@(() => new Date())></x-b><x-b .onSave=@formatea></x-b>')).toEqual([]);
    expect(portable('@{ const v = 1; }<button @click=@(() => v + $x)>x</button>')).toEqual(['FUD0907 v']);
    expect(portable('@{ const v = 1; }<x-b .onSave=@(function () { return v; })></x-b>')).toEqual(['FUD0907 v']);
  });

  it('a prop that is no callback is a value of the view', () => {
    expect(portable('<x-b .n=@(a + b) .f=@esValida .g=@(-a) .h=@a></x-b>')).toEqual([]);
    expect(portable('@{ const formatea = 1; }<x-b .f=@formatea></x-b>')).toEqual(['FUD0918 formatea']);
  });
});
