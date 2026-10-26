/**
 * The typed pass of the portable view (SDD-61 §4.2, task 22): criteria 2 (`@hora()`), 6, 7, 8, 9,
 * 22, 23, 38 (`xs.sort()`) and 39, each code on its exact span, read through the project checker
 * over a real project on disk — the program the build hands over.
 *
 * `@fudic/core` and `@fudic/forms` are installed as the names the pass reads them by: the pass
 * asks the checker what a type is CALLED, so a declaration with the same names is the package.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { createProjectChecker, GLOBALS_DTS, parseSource, portableTypeDiagnostics, projectParsed, toPosix } from '../src/index.js';
import { indexOf } from './_support.js';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2024',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    lib: ['ES2024', 'DOM'],
  },
  include: ['**/*.ts', '**/*.fud'],
});

const CORE = `export interface Signal<T> { (): T; set(v: T): void }
export interface Computed<T> { (): T }
export type Readable<T> = () => T;
export interface TrustedURL { readonly fudicTrustedUrl: string }
export declare function signal<T>(v: T): Signal<T>;
export declare function computed<T>(f: () => T): Computed<T>;
export declare function trustedUrl(v: string): TrustedURL;
`;

const FORMS = `export type Readable<T> = () => T;
export interface Control<T> { (): T; set(v: T): void; touch(): void; readonly errors: Readable<readonly string[] | null> }
export interface TypedControl<T> extends Control<T> { readonly type: string }
export type Str = TypedControl<string>;
export interface FormApi { readonly $valid: Readable<boolean>; $touch(): void }
`;

const I18N = `export interface Pipe<T> { readonly kind: string; readonly input?: T }
export declare function date(options: Intl.DateTimeFormatOptions & { timeZone: string }): Pipe<Date | number>;
`;

const IMPORTS =`import { signal, computed, trustedUrl, type Readable, type TrustedURL } from '@fudic/core';
  import type { Control, FormApi, Str } from '@fudic/forms';`;

/** A component `app-<name>` with `code` in its `@code` and `markup` in its shadow root. */
function component(name: string, code: string, markup: string, after = ''): string {
  return `@code {
  ${IMPORTS}
  ${code}
}
<app-${name}>
  <template shadowrootmode="open">
${markup}
  </template>
</app-${name}>
${after}`;
}

/** The types every case reads. */
const TYPES = `type Item = { ok: boolean; n: number; titulo: string; nombre: string; creada: Date };
  type User = { name: string };`;

const CASES: Readonly<Record<string, string>> = {
  // Criterion 2 and 38: a call with no arguments reads something reactive.
  calls: component(
    'calls',
    `${TYPES}
  const count = signal(0);
  const { xs } = props<{ xs: Item[] }>();
  const form = {} as FormApi;
  const campo = {} as Control<string>;
  const nombre = {} as Str;
  const leer = {} as Readable<number>;
  const quizas = {} as Control<string> | undefined;
  const alguno = {} as Control<string> | null;
  function hora() { return 1; }`,
    `<p>@hora() @count() @(form.$valid()) @campo.errors() @campo() @nombre() @leer() @(quizas?.()) @alguno() @(xs.sort()) @((hora)())</p>`,
  ),
  // Criterion 6: no truthiness.
  conditions: component(
    'conditions',
    `type Nodo = { next: Nodo | null };
  const { nombre, ok, n, cur } = props<{ nombre: string | null; ok: boolean; n: number; cur: Nodo | null }>();`,
    `@if (nombre) { <b></b> } else if (nombre !== null) { <i></i> }
<p>@(ok && "si") @(!n) @(ok || n > 0) @(ok ? 1 : 2) @(n ? 1 : 2) @(nombre ?? "-")</p>
@while (cur) { <i></i> }`,
  ),
  // Criterion 7: the operands of §3.4.
  operands: component(
    'operands',
    `${TYPES}
  const { n, s, flag, post, otro, maybe, d } = props<{ n: number; s: string; flag: boolean; post: Item; otro: Item; maybe: number | null; d: Date }>();`,
    `<p>@(n < "a") @(\`\${flag}\`) @(\`\${n} \${s}\`) @(post === otro) @(n + null) @(n + 1) @(s + n) @(n + s) @(flag + 1)</p>
<p>@(n % 2) @(-n) @(-s) @(s * 2) @(maybe === null) @(s === "x") @(post.titulo !== s) @(d < d) @(s <= s) @(flag > n) @(maybe < 1)</p>`,
  ),
  // Criteria 8 and 9: `.length` and indices.
  members: component(
    'members',
    `${TYPES}
  type Holder = { length: number; size: number };
  const { xs, s, m, k, post, h, f } = props<{ xs: readonly Item[]; s: string; m: Readonly<Record<string, number>>; k: string; post: Item; h: Holder; f: Readable<number> }>();`,
    `<p>@(xs.length) @(s.length) @(m.length) @(xs["length"]) @(h.length) @(f.length)</p>
<p>@(xs[0]?.n) @(m[k]) @(post["titulo"]) @(xs?.[0]?.n)</p>`,
  ),
  // Criterion 39: the collection operations.
  collections: component(
    'collections',
    `${TYPES}
  const { xs, post, nums } = props<{ xs: readonly Item[]; post: Item; nums: readonly number[] }>();
  const esValida = (x: Item): boolean => x.ok;`,
    `<p>@(xs.filter(x => x.nombre).length) @(xs.filter(x => x.ok).length) @(xs.toSorted((a, b) => a.titulo)[0]?.n)</p>
<p>@(xs.toSorted((a, b) => a.n - b.n).length) @(post.filter(p => true)) @(xs.map(x => x.n).length) @(xs.map(x => x.creada).length)</p>
<p>@(xs.reduce((acc, x) => acc + x.n, 0)) @(xs.filter(esValida).length) @(xs.filter(x => { return x.ok; }).length) @(nums.reduce((acc, x) => acc + x))</p>
<p>@(xs.toSorted((a, b) => a.titulo < b.titulo ? -1 : a.titulo > b.titulo ? 1 : 0).length) @(xs.toSorted((a, b) => a.creada < b.creada ? -1 : 0).length)</p>`,
  ),
  // Criterion 22: a literal of data has a named type.
  literals: component(
    'literals',
    `type Nodo = { valor: number; next: Nodo | null };
  type Paso = { titulo: string };
  const lista: Nodo = { valor: 1, next: { valor: 2, next: null } };
  const suelta = { valor: 1 };
  const pasos = signal<readonly Paso[]>([{ titulo: 'a' }]);
  const anonimos = signal([{ titulo: 'a' }]);
  const nums = [1, 2];
  const maybe: Nodo | null = { valor: 1, next: null };
  const base: Paso = { titulo: 'b' };
  const extendido: Paso = { ...base };
  const mezcla: Paso & { extra: string } = { titulo: 'a', extra: 'b' };
  const { valor } = lista;
  const mapa: Readonly<Record<string, number>> = {};
  const { k1 } = mapa;
  const visto = { titulo: 'x' } satisfies Paso;
  const envuelto: Paso = ({ titulo: 'y' });
  const rodeado = ({ titulo: 'z' } satisfies Paso);`,
    `<p>@lista.valor @suelta.valor @(pasos().length) @(anonimos().length) @(nums.length) @(maybe?.valor)</p>
<p>@extendido.titulo @mezcla.titulo @valor @k1 @visto.titulo @envuelto.titulo @rodeado.titulo</p>`,
  ),
  // The rest of §3.4 and §3.7, for every branch of the pass.
  more: component(
    'more',
    `${TYPES}
  type Item2 = { o: { a: string }; n: number };
  type H = { readonly [K in 'length']: number };
  const { xs, ys, n, sn, anyv, h, post } = props<{ xs: readonly Item[]; ys: readonly Item2[]; n: number; sn: string | number; anyv: any; h: H; post: Item2 }>();`,
    `<p>@((n) + 1) @(n ** 2) @(typeof n) @(anyv + 1) @(anyv < 1) @(sn < 1) @(n()) @(h.length)</p>
<p>@(ys.map(y => y.o).length) @(ys.reduce((acc, y) => acc, post.o)) @(xs["filter"](x => x.ok).length)</p>
@{ let vacia; if (n > 0) { } }
@for (; n > 0; ) { <i></i> }
@for (let i = 0; ; i++) { <i></i> }
@foreach (x of xs) key (x) { <i></i> }
@{ const { titulo, ...resto } = xs[0]!; }`,
  ),
  // Props whose members are declared in no copied text of the file.
  external: component('external', `import type { Ext } from '../tipos';\n  const p = props<Ext>();`, `<p>@p.ext.a</p>`),
  mapped: component('mapped', `const p = props<{ readonly [K in 'a' | 'b']: string }>();`, `<p>@p.a</p>`),
  // Criterion 23: the props port; a callback is a function.
  props: component(
    'props',
    `type User = { name: string };
  const p = props<{ user: { name: string }; named: User; onSave: () => void; tags?: readonly string[]; when: Date }>();`,
    `<p>@p.named.name</p>`,
  ),
  // The places of §3.7 and §3.10 that only the types decide.
  places: component(
    'places',
    `${TYPES}
  const { xs, s, flag, m, n, ms } = props<{ xs: readonly Item[]; s: string; flag: boolean; m: Readonly<Record<string, number>>; n: number; ms: readonly Readonly<Record<string, number>>[] }>();`,
    `@foreach (const x of xs) key (x.n) { <span>@x.titulo</span> }
@foreach (const c of s) key (c) { <span>@c</span> }
@foreach (const x of xs) key (x.ok) { <span></span> }
@foreach (const { a, b = n > 0 } of ms) key (a) { <span></span> }
@for (let i = 0; i < n; i++) { <i>@i</i> }
@for (let i = 0; n; i += 1) { <i></i> }
@switch (s) { case 'a': <b></b> }
@switch (flag) { case true: <b></b> }
@{ const { k } = m; let total = 0; total += n; const { titulo } = xs[0]!; }
<input ...m>
<input ...xs>
<p>@(s | upper)</p>`,
  ),
  // §3.10, type by type, through what the cut holds.
  types: component(
    'types',
    `${TYPES}
  enum Color { Red, Green }
  class Caja { v = 1 }
  type Arbol = { valor: number; hijos: readonly Arbol[] };
  interface Raro { m: Map<string, number> }
  const texto = signal('a');
  const tono = signal<'a' | 'b'>('a');
  const sino = signal<boolean | null>(null);
  const cuenta = signal<1 | 2>(1);
  const color = signal(Color.Red);
  const varios = signal<string | number>('a');
  const grande = signal(10n);
  const mapa = signal(new Map<string, number>());
  const caja = signal(new Caja());
  const par = signal<[string, number]>(['a', 1]);
  const ambos = signal<Item & { extra: string }>({} as Item & { extra: string });
  const fecha = signal<Date>({} as Date);
  const arbol = signal<Arbol>({ valor: 1, hijos: [] });
  const raro = signal<Raro>({} as Raro);
  const url = trustedUrl('/a');
  const doble = computed(() => texto().length * 2);
  const vacio = signal([]);
  const cualquiera = signal<any>(1);
  const fn = signal(() => 1);
  const reg = signal<Readonly<Record<string, Item>>>({});
  const malReg = signal<Readonly<Record<string, Map<string, number>>>>({});
  const enlace = signal<string | TrustedURL>('/a');
  const malEnlace = signal<number | TrustedURL>(1);
  const lectura = computed(() => tono() === 'a');
  const leido = texto();`,
    `<p>@texto() @tono() @(sino() ?? 0) @cuenta() @color() @varios() @(grande() ?? 0) @(mapa() ?? 0) @(caja() ?? 0) @(par() ?? 0) @(ambos().n) @(fecha() ?? 0) @(arbol().valor) @(raro() ?? 0) @(url ?? 0) @doble() @(vacio().length) @(cualquiera()) @(fn() ?? 0) @(reg()["a"]?.n) @(malReg() ?? 0) @lectura() @leido</p><a href=@enlace()></a><a href=@malEnlace()></a>`,
  ),
  // §3.6 and §3.9: a default makes a name present, `null` included; a preset's options are not data.
  defaults: component(
    'defaults',
    `import { date } from '@fudic/i18n';
  type Ficha = { activo?: boolean | null; n?: number | null };
  const { titulo = 'x', fichas } = props<{ titulo?: string | null; fichas: readonly Ficha[] }>();
  const hora = date({ timeStyle: 'short', timeZone: 'UTC' });
  const suelto = signal({ a: 1 });
  const pocas = fichas.filter(f => f.n === 1);`,
    `@foreach (const { activo = false, n = 0 } of fichas) key (n) { <i>@(activo ? 'si' : 'no') @(titulo + '!')</i> }
@foreach (const { activo } of fichas) key (activo) { <i>@(activo ? 'si' : 'no')</i> }
<p>@suelto().a @(pocas.length) @hora.kind</p>`,
  ),
  // §3.10: the parameters of a snippet, once each.
  snippets: component(
    'snippets',
    `${TYPES}
  const { xs } = props<{ xs: readonly Item[] }>();`,
    `<p>@(xs.length)</p>`,
    `@snippet fila(item: Item, extra: { a: string }, n: number = 1, { b }: { b: string }) { <span>@item.titulo @n @b</span> }\n`,
  ),
};

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-portable-')));
  const all = {
    'tsconfig.json': TSCONFIG,
    'node_modules/@fudic/core/package.json': JSON.stringify({ name: '@fudic/core', types: 'index.d.ts' }),
    'node_modules/@fudic/core/index.d.ts': CORE,
    'node_modules/@fudic/forms/package.json': JSON.stringify({ name: '@fudic/forms', types: 'index.d.ts' }),
    'node_modules/@fudic/forms/index.d.ts': FORMS,
    'node_modules/@fudic/i18n/package.json': JSON.stringify({ name: '@fudic/i18n', types: 'index.d.ts' }),
    'node_modules/@fudic/i18n/index.d.ts': I18N,
    ...files,
  };
  for (const [relative, text] of Object.entries(all)) {
    const file = join(root, relative);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

const files = {
  ...Object.fromEntries(Object.entries(CASES).map(([name, source]) => [`src/components/app-${name}.fud`, source])),
  'src/tipos.ts': 'export type Ext = { ext: { a: string } };\n',
};

/** A program over the projection `text` at `path`, with the ambient declarations it is written against. */
function programOver(path: string, text: string): ts.Program {
  const memory: Readonly<Record<string, string>> = { [path]: text, '/p/fudic-globals.d.ts': GLOBALS_DTS };
  const host = ts.createCompilerHost({});
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language) => {
    const own = memory[name];
    return own === undefined ? read(name, language) : ts.createSourceFile(name, own, language);
  };
  return ts.createProgram({ rootNames: Object.keys(memory), options: { strict: true, noEmit: true }, host });
}

const ROOT = project(files);
const report = createProjectChecker({ root: ROOT, portableView: true }).check();

/** The codes of this pass. */
const TYPED: ReadonlySet<string> = new Set(['FUD1140', 'FUD1151', 'FUD1152', 'FUD1153']);

/** What the pass reports on case `name`, as `CODE text`, in source order. */
function found(name: string): readonly string[] {
  const path = `${ROOT}/src/components/app-${name}.fud`;
  const source = CASES[name]!;
  return report.problems
    .filter((p) => p.file === path && TYPED.has(p.code))
    .map((p) => `${p.code} ${source.slice(p.span.start, p.span.end)}`);
}

describe('calls (criteria 2 and 38)', () => {
  it('a call with no arguments reads a signal, a computed, a Readable or a control; anything else is FUD1140', () => {
    // `quizas?.()` and `(hora)()` are the compiler's FUD1140: the pass does not say them again.
    expect(found('calls')).toEqual(['FUD1140 hora', 'FUD1140 quizas', 'FUD1140 xs.sort', 'FUD1140 (hora)']);
  });

  it('the message names the callee as written', () => {
    const problem = report.problems.find((p) => p.code === 'FUD1140' && p.file.endsWith('app-calls.fud'));
    expect(problem?.message).toContain('`hora(…)`');
  });
});

describe('conditions (criterion 6)', () => {
  it('a condition and a logical operand are a boolean', () => {
    expect(found('conditions')).toEqual(['FUD1151 nombre', 'FUD1151 "si"', 'FUD1151 n', 'FUD1151 n', 'FUD1151 cur']);
  });
});

describe('operands (criterion 7)', () => {
  it('each operator gets the operands it ports for, the culprit underlined', () => {
    expect(found('operands')).toEqual([
      'FUD1152 "a"',
      'FUD1152 flag',
      'FUD1152 post',
      'FUD1152 otro',
      'FUD1152 null',
      'FUD1152 flag',
      'FUD1152 s',
      'FUD1152 s',
      'FUD1152 flag',
      'FUD1152 maybe',
    ]);
  });
});

describe('members (criteria 8 and 9)', () => {
  it('`.length` of a list, a text or a declared field; an index into a list or a map', () => {
    expect(found('members')).toEqual(['FUD1153 m.length', 'FUD1153 xs["length"]', 'FUD1153 f.length', 'FUD1153 post["titulo"]']);
  });
});

describe('collections (criterion 39)', () => {
  it('filter takes a boolean, toSorted a number, and only a list has them', () => {
    expect(found('collections')).toEqual([
      'FUD1151 x.nombre',
      'FUD1152 a.titulo',
      'FUD1153 post',
    ]);
  });
});

describe('literals of data (criterion 22)', () => {
  it('a literal with a named type compiles; without one it is FUD1153, on the literal', () => {
    expect(found('literals')).toEqual([
      'FUD1153 { valor: 1 }',
      "FUD1153 { titulo: 'a' }",
      "FUD1153 { titulo: 'a', extra: 'b' }",
      'FUD1153 { k1 }',
    ]);
  });
});

describe('defaults and presets (§3.6, §3.9)', () => {
  it('a name with a default is present even over `T | null`; the options of a preset are not a literal of data', () => {
    expect(found('defaults')).toEqual(['FUD1153 { a: 1 }', 'FUD1153 activo', 'FUD1151 activo']);
  });
});

describe('props (criterion 23)', () => {
  it('an anonymous nested object is FUD1153 on the member; a named type and a callback are not', () => {
    expect(found('props')).toEqual(['FUD1153 user']);
  });
});

describe('places of the view (§3.7, §3.10)', () => {
  it('the iterable, the key, the subject, the step, a destructured or spread map', () => {
    expect(found('places')).toEqual([
      'FUD1153 s',
      'FUD1153 x.ok',
      'FUD1153 { a, b = n > 0 }',
      'FUD1151 n',
      'FUD1153 flag',
      'FUD1153 { k }',
      'FUD1153 m',
    ]);
  });
});

describe('portable types (§3.10)', () => {
  it('what the cut holds has a type every backend has', () => {
    expect(found('types')).toEqual([
      'FUD1153 varios',
      'FUD1153 grande',
      'FUD1153 mapa',
      'FUD1153 caja',
      'FUD1153 par',
      'FUD1153 ambos',
      'FUD1153 raro',
      'FUD1153 cualquiera',
      'FUD1153 fn',
      'FUD1153 malReg',
      'FUD1153 malEnlace',
    ]);
  });

  it('a snippet parameter ports, once per parameter', () => {
    expect(found('snippets')).toEqual(['FUD1153 extra']);
  });
});

describe('portableTypeDiagnostics, alone', () => {
  it('says nothing about a document the program does not hold', () => {
    const program = ts.createProgram({ rootNames: [], options: {} });
    const index = indexOf({});
    const document = projectParsed('/p/app-x.fud', parseSource(CASES['calls']!), index);
    expect(portableTypeDiagnostics(program, document)).toEqual([]);
    expect(portableTypeDiagnostics(program, { ...document, virtuals: [] })).toEqual([]);
  });

  it('asks nothing of a projection whose stretches allow no diagnostic', () => {
    for (const name of ['literals', 'snippets', 'props', 'operands', 'collections', 'places']) {
      const path = `/p/app-${name}.ts`;
      const document = projectParsed(path, parseSource(CASES[name]!), indexOf({}));
      const client = document.virtuals.find((v) => v.languageId !== 'css')!;
      const silent = {
        ...document,
        virtuals: [{ ...client, mappings: client.mappings.map((m) => ({ ...m, caps: { ...m.caps, verification: false } })) }],
      };
      expect(portableTypeDiagnostics(programOver(path, client.text), silent)).toEqual([]);
    }
  });

  it('runs only behind the switch while the repository migrates', () => {
    const quiet = createProjectChecker({ root: ROOT }).check();
    expect(quiet.problems.filter((p) => TYPED.has(p.code))).toEqual([]);
  });
});

describe('every branch of §3.4 and §3.7', () => {
  it('reports what ports nowhere and stays silent on what the compiler or TypeScript already said', () => {
    expect(found('more')).toEqual([
      'FUD1153 ys',
      'FUD1153 sn',
      'FUD1153 anyv',
      'FUD1153 post',
      'FUD1152 sn',
      'FUD1140 n',
      'FUD1153 y.o',
      'FUD1153 post.o',
      // The compiler's: the callee is not a path.
      'FUD1140 xs["filter"]',
    ]);
  });

  it('a prop declared in no copied text of the file is not underlined there', () => {
    expect(found('external')).toEqual([]);
    expect(found('mapped')).toEqual([]);
  });
});
