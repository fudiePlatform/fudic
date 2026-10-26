/**
 * SDD-61 §3.9 — what the server evaluates of the `@code`, with the portable view switched on.
 *
 * Criteria 19 (the part without types), 20, 21 and 24: each code on its exact span, one per
 * node, `FUD1150` with `related` to the first use in the view, and a store read through the
 * host's `readModule`.
 */

import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../src/types/index.js';
import { analyze, type ProjectModule, type SemanticInput } from '../../src/semantic/index.js';
import { viewInput } from './_view.js';

/** The codes of the portable view and of the server cut. */
const OWN = /^FUD09[01]\d$|^FUD114\d$|^FUD115[0-3]$/u;

const FUD = '/app/src/routes/page.fud';

function source(template: string, code: string): string {
  return `@code {\n${code}\n}\n<x-a><template shadowrootmode="open">${template}</template></x-a>`;
}

/** The project's modules, by the path `readModule` answers for a specifier. */
type Modules = Readonly<Record<string, string>>;

/** A host that reads `modules`, resolving `./x` and `../x` against the importer like a disk. */
function host(modules: Modules): Pick<SemanticInput, 'readModule' | 'path'> {
  const read = new Map<string, ProjectModule>();
  return {
    path: FUD,
    readModule(specifier, importer) {
      const parts = importer.split('/').slice(0, -1);
      for (const part of specifier.split('/')) {
        if (part === '..') parts.pop();
        else if (part !== '.') parts.push(part);
      }
      const path = parts.join('/');
      const text = modules[path];
      if (text === undefined) return undefined;
      // The same object while the text is the same: what keeps one parse per version.
      const cached = read.get(path) ?? { path, source: text };
      read.set(path, cached);
      return cached;
    },
  };
}

function diagnostics(template: string, code: string, extra: Partial<SemanticInput> = {}): readonly Diagnostic[] {
  return analyze({ ...viewInput(source(template, code)), portableView: true, ...extra }).diagnostics.filter((d) =>
    OWN.test(d.code),
  );
}

/** `CODE text` of every diagnostic in the `.fud`, and `CODE path: text` of one in a module. */
function cut(template: string, code: string, modules?: Modules): readonly string[] {
  const text = source(template, code);
  return diagnostics(template, code, modules === undefined ? {} : host(modules)).map((d) => {
    if (d.file === undefined) return `${d.code} ${text.slice(d.span.start, d.span.end)}`;
    return `${d.code} ${d.file}: ${modules![d.file]!.slice(d.span.start, d.span.end)}`;
  });
}

/** Where each diagnostic's `related` points, as text of the file it is in. */
function related(template: string, code: string, modules?: Modules): readonly string[] {
  const text = source(template, code);
  return diagnostics(template, code, modules === undefined ? {} : host(modules)).flatMap((d) =>
    (d.related ?? []).map((r) => `${r.file ?? '.'} ${r.message}: ${text.slice(r.span.start, r.span.end)}`),
  );
}

const CORE = `import { signal, computed, now, inject, effect } from '@fudic/core';`;

describe('the forms of the cut (§3.9)', () => {
  it('props, signal, computed and a const of the list compile', () => {
    const code = `${CORE}
      const { tone = 'neutral', size = 1 } = props<{ tone?: string; size?: number }>();
      const n = signal(10);
      const doble = computed(() => n() * 2);
      let veces = 0;
      const etiqueta = \`\${tone} \${size}\`;
      const leido = n();
      const ns = signal([1, 2]);
      const altas = computed(() => ns().filter((x) => x > veces));
      const grupo = { n };
      const deGrupo = grupo.n();
      const primeros = ns().map((x) => x * 2);`;
    expect(cut('<p>@doble() @etiqueta @leido @(altas().length) @deGrupo @primeros</p>', code)).toEqual([
      'FUD1143 { n }',
    ]);
    // A catalogue import read as such is no declaration to judge.
    expect(cut('<p>@(signal ?? 1)</p>', code)).toEqual([]);
  });

  it('a zero-argument call that is not on a path is the declaration\'s FUD1150', () => {
    const code = `${CORE}
      const xs = signal([signal(1)]);
      const k = 'a';
      const primero = xs()[0]();
      const raro = xs()[k]();`;
    expect(cut('<p>@primero @raro</p>', code)).toEqual(['FUD1150 primero = xs()[0]()', 'FUD1150 raro = xs()[k]()']);
  });

  it('a name imported as a type is TypeScript\'s to report when read as a value', () => {
    const code = `
      import type { Tarea } from './tipos.ts';
      import { type Otra } from './tipos.ts';`;
    expect(cut('<p>@(Tarea ?? 1) @(Otra ?? 1)</p>', code)).toEqual([]);
  });

  it('a literal of data is evaluated as data, at any depth and under satisfies', () => {
    const code = `${CORE}
      const lista = { valor: 1, siguiente: { valor: -2, siguiente: null, 'clave': [true, 'x'] } };
      const pasos = signal([{ id: 'a' }, { id: 'b' }]);
      const conTipo = { a: 1 } satisfies Record<string, number>;
      const vacia = signal();`;
    expect(cut('<p>@lista.valor @(pasos().length) @conTipo.a @vacia()</p>', code)).toEqual([]);
  });

  it('a literal that is not all data is the view\'s FUD1143', () => {
    const code = `${CORE}
      const a = 1;
      const xs = [a, 2];
      const o = { a };
      const p = { ...o };
      const q = { [a]: 1 };
      const m = { f() { return 1; } };
      const g = { get v() { return 1; } };
      const h = [, 1];
      const big = [10n];
      const re = [/x/];
      const neg = [-a];
      const not = [!true];
      const sp = [...xs];`;
    const view = '<p>@xs @o @p @q @m @g @h @big @re @neg @not @sp</p>';
    expect(cut(view, code)).toEqual([
      'FUD1143 [a, 2]',
      'FUD1143 { a }',
      'FUD1143 { ...o }',
      'FUD1143 { [a]: 1 }',
      'FUD1143 { f() { return 1; } }',
      'FUD1143 { get v() { return 1; } }',
      'FUD1143 [, 1]',
      'FUD1143 [10n]',
      'FUD1143 [/x/]',
      'FUD1143 [-a]',
      'FUD1143 [!true]',
      'FUD1143 [...xs]',
    ]);
  });

  it('inject reads a service, and its token is not followed', () => {
    const code = `${CORE}
      class Token {}
      const servicio = inject(Token);`;
    expect(cut('<p>@servicio.nombre</p>', code)).toEqual([]);
  });

  it('the catalogue calls take literals of data, holes and values', () => {
    const code = `
      import { date, currency } from '@fudic/i18n';
      import { t } from '@fudic/i18n';
      import { trustedUrl } from '@fudic/dom';
      const zona = 'Europe/Madrid';
      const hora = date({ timeZone: zona, hour: 'numeric' });
      const euros = currency('EUR');
      const titulo = t('Hola {n}', { n: zona });
      const enlace = trustedUrl(\`/x/\${zona}\`);
      const mal = date({ timeZone: zona.toUpperCase(1) });`;
    expect(cut('<p>@(1 | hora) @(1 | euros) @titulo <a href=@enlace>x</a> @(1 | mal)</p>', code)).toEqual([
      'FUD1140 zona.toUpperCase',
    ]);
  });
});

describe('a declaration the server cannot evaluate (criterion 20)', () => {
  it('a function read as a value is FUD1150, on the declaration, with related to the use', () => {
    const code = `function hora() { return 'x'; }`;
    const view = '<x-b .valor=@(hora ?? 1)></x-b><p>@(hora ?? 2)</p>';
    expect(cut(view, code)).toEqual([`FUD1150 function hora() { return 'x'; }`]);
    expect(related(view, code)).toEqual(['. read here by the view: hora']);
  });

  it('a function the view calls is the call\'s business, and its body is not followed', () => {
    const code = `
      const fmt = new Intl.NumberFormat();
      function hora() { return fmt.format(1); }
      const otra = () => fmt;`;
    expect(cut('<p>@hora() @otra()</p>', code)).toEqual([]);
  });

  it('a callback, a handler and a function bound to a name are browser code', () => {
    const code = `${CORE}
      const n = signal(0);
      function guardar() { return new Date(); }
      const fuera = () => n.set(1);`;
    const view = '<x-b .onSave=@guardar .onX=@(() => guardar()) @click=@fuera></x-b><p>@n()</p>';
    expect(cut(view, code)).toEqual([]);
  });

  it('a const that uses toLocaleTimeString, or a new, is FUD1150 with related', () => {
    const code = `${CORE}
      const ahora = signal(now());
      const texto = ahora().toLocaleTimeString('es-ES');
      const fecha = new Date();
      const opt = ahora?.();
      const raro = (ahora || ahora)();`;
    const view = '<p>@texto @fecha @opt @raro</p>';
    expect(cut(view, code)).toEqual([
      "FUD1150 texto = ahora().toLocaleTimeString('es-ES')",
      'FUD1150 fecha = new Date()',
      'FUD1140 ahora',
      'FUD1150 raro = (ahora || ahora)()',
    ]);
    expect(related(view, code)).toEqual([
      '. read here by the view: texto',
      '. read here by the view: fecha',
      '. read here by the view: raro',
    ]);
  });

  it('a let with no initializer, a class, an enum and a bound function are FUD1150', () => {
    const code = `
      let cursor;
      class Caja {}
      enum Color { Rojo }
      const f = function () { return 1; };`;
    expect(cut('<p>@(cursor ?? 1) @(Caja ?? 1) @Color.Rojo @(f ?? 1)</p>', code)).toEqual([
      'FUD1150 cursor',
      'FUD1150 class Caja {}',
      'FUD1150 enum Color { Rojo }',
      'FUD1150 f = function () { return 1; }',
    ]);
  });

  it('a computed whose arrow does not have the form is FUD1150', () => {
    const code = `${CORE}
      const a = computed(() => { return 1; });
      const b = computed((x) => x);
      const c = computed(async () => 1);
      const d = computed(() => 1, 2);`;
    expect(cut('<p>@a() @b() @c() @d()</p>', code)).toEqual([
      'FUD1150 a = computed(() => { return 1; })',
      'FUD1150 b = computed((x) => x)',
      'FUD1150 c = computed(async () => 1)',
      'FUD1150 d = computed(() => 1, 2)',
    ]);
  });

  it('a name of a package outside the catalogue is FUD1150 on the import', () => {
    const code = `
      import { effect } from '@fudic/core';
      import core from '@fudic/core';
      import * as todo from '@fudic/core';
      import { format } from 'date-fns';
      import type { Tarea } from 'fudic:tareas';
      import { type Otra } from './tipos.ts';
      import { lista } from 'fudic:tareas';
      const x = effect(() => 1);`;
    expect(cut('<p>@(effect ?? 1) @x @core @todo.x @format @lista</p>', code)).toEqual([
      'FUD1150 effect',
      'FUD1150 x = effect(() => 1)',
      'FUD1150 core',
      'FUD1150 * as todo',
      'FUD1150 format',
    ]);
  });

  it('each declaration is judged once, whatever reads it, following the cut', () => {
    const code = `${CORE}
      const base = signal(0);
      const texto = base().toFixed(2);
      const a = computed(() => texto);
      const b = computed(() => texto);`;
    const view = '<p>@a() @b()</p>';
    expect(cut(view, code)).toEqual(['FUD1150 texto = base().toFixed(2)']);
    // The use that pulled it in, transitively: the first read of the view.
    expect(related(view, code)).toEqual(['. read here by the view: a']);
  });

  it('props is the catalogue\'s only while the @code does not declare it', () => {
    // Its defaults are then no defaults of props: the call is a read like any other.
    const code = `${CORE}
      const props = computed(() => ({ a: 1 }));
      const { a = Math.PI } = props();`;
    expect(cut('<p>@a</p>', code)).toEqual(['FUD1143 { a: 1 }']);
  });
});

describe('the white list over the initializers (criterion 19)', () => {
  it('computed(() => xs().find(…)) read by the view is FUD1140 in the @code', () => {
    const code = `${CORE}
      const xs = signal([{ ok: true }]);
      const primero = computed(() => xs().find((x) => x.ok));`;
    expect(cut('<p>@primero()</p>', code)).toEqual(['FUD1140 xs().find']);
  });

  it('each node gets the markup\'s own code, and what it refused is not followed', () => {
    const code = `${CORE}
      const n = signal(Math.random());
      const m = signal(n() == 1);
      const k = computed(() => new Date());
      const fmt = () => 1;
      const r = computed(() => [1].filter(fmt).length);`;
    expect(cut('<p>@n() @m() @k() @r()</p>', code)).toEqual([
      'FUD0907 Math',
      'FUD1142 ==',
      'FUD1141 new Date',
      'FUD1145 fmt',
    ]);
  });

  it('a default of props follows the list', () => {
    const code = `const { a = Math.PI, b = 1 } = props<{ a?: number; b?: number }>();`;
    expect(cut('<p>@a @b</p>', code)).toEqual(['FUD0907 Math']);
  });
});

describe('now() (criterion 24)', () => {
  it('signal(now()) compiles; now() anywhere else of the cut is FUD0912', () => {
    const code = `${CORE}
      const ahora = signal(now());
      const doble = computed(() => now());
      const fijo = now();`;
    expect(cut('<p>@ahora() @doble() @fijo</p>', code)).toEqual(['FUD0912 now()', 'FUD0912 now()']);
  });

  it('in the view it is FUD0912, and in a handler it is a function like any other', () => {
    const code = `${CORE}
      import { date } from '@fudic/i18n';
      const hora = date({ hour: 'numeric' });
      const ahora = signal(now());`;
    expect(cut('<p>@(now() | hora)</p>', code)).toEqual(['FUD0912 now()']);
    expect(cut('<button @click=@(() => ahora.set(now()))>x</button>', code)).toEqual([]);
  });

  it('now with arguments is not the clock of a signal', () => {
    const code = `${CORE}
      const ahora = signal(now(1));`;
    expect(cut('<p>@ahora()</p>', code)).toEqual(['FUD0912 now(1)']);
  });
});

describe('stores and data modules (criterion 21)', () => {
  const STORE = '/app/src/store/contador.ts';

  it('a store of signals compiles, and nothing is read without readModule or a path', () => {
    const modules = { [STORE]: `import { signal, computed } from '@fudic/core';\nconst base = signal(0);\nexport const count = signal(0);\nexport const doble = computed(() => base() * 2);` };
    const code = `import { count, doble } from '../store/contador.ts';`;
    expect(cut('<p>@count() @doble()</p>', code, modules)).toEqual([]);
    expect(cut('<p>@count()</p>', `import { count } from '../store/nada.ts';`, modules)).toEqual([]);
    const bad = `import { count } from '../store/contador.ts';\nconst x = signal(Math.random());`;
    expect(diagnostics('<p>@count()</p>', bad, { readModule: host({}).readModule! })).toEqual([]);
  });

  it('a node off the list is reported in the store, with related to the view', () => {
    const modules = { [STORE]: `import { signal, now } from '@fudic/core';\nexport const count = signal(Math.random());\nexport const reloj = signal(now());\nexport function sumar() { return 1; }` };
    const code = `import { count, reloj, sumar } from '../store/contador.ts';`;
    const view = '<p>@count() @reloj() @(sumar ?? 1) @sumar()</p>';
    expect(cut(view, code, modules)).toEqual([
      `FUD0907 ${STORE}: Math`,
      `FUD0912 ${STORE}: now()`,
      `FUD1150 ${STORE}: function sumar() { return 1; }`,
    ]);
    expect(related(view, code, modules)).toEqual([
      `${FUD} read here by the view: count`,
      `${FUD} read here by the view: reloj`,
      `${FUD} read here by the view: sumar`,
    ]);
  });

  it('the chain of export … from is followed inside the project', () => {
    const modules = {
      '/app/src/store/index.ts': `export { count as total } from './contador.ts';\nexport * from './otro.ts';\nexport * as todo from './otro.ts';\nimport { x } from './otro.ts';\nexport { x as "equis", x };`,
      [STORE]: `import { signal } from '@fudic/core';\nexport const count = signal(new Date());`,
      '/app/src/store/otro.ts': `export const x = 1;\nexport const y = new Date();\nexport * from './index.ts';`,
    };
    const code = `import { total, y, equis, x as ex, nada } from '../store/index.ts';\nimport * as todo from '../store/index.ts';`;
    expect(cut('<p>@total() @y @equis @ex @nada @todo.x</p>', code, modules)).toEqual([
      `FUD1141 ${STORE}: new Date`,
      'FUD1150 /app/src/store/otro.ts: y = new Date()',
    ]);
  });

  it('a data module exports a literal of data by default', () => {
    const modules = {
      '/app/src/data/posts.fixture.ts': `export default { posts: [{ slug: 'a' }] };`,
      '/app/src/data/nombrado.ts': `const datos = { a: 1 };\nexport default datos;`,
      '/app/src/data/malo.ts': `export default (() => 1)();`,
      '/app/src/data/sin.ts': `export const a = 1;`,
    };
    const code = `import posts from '../data/posts.fixture.ts';\nimport nombrado from '../data/nombrado.ts';\nimport malo from '../data/malo.ts';\nimport sin from '../data/sin.ts';`;
    expect(cut('<p>@posts.posts @nombrado.a @malo @sin</p>', code, modules)).toEqual([
      'FUD1150 /app/src/data/malo.ts: export default (() => 1)();',
    ]);
  });

  it('a module that does not parse is TypeScript\'s to report', () => {
    const modules = { [STORE]: `export const count = signal(;` };
    expect(cut('<p>@count()</p>', `import { count } from '../store/contador.ts';`, modules)).toEqual([]);
  });

  it('a name a module exports and does not declare, or does not export, is not judged', () => {
    const modules = { [STORE]: `export { nada as fantasma };\nexport default { a: 1 };\nexport const real = 1;` };
    const code = `import { fantasma, real } from '../store/contador.ts';`;
    expect(cut('<p>@fantasma @real</p>', code, modules)).toEqual([]);
  });

  it('a store reached twice is judged once', () => {
    const modules = { [STORE]: `export const count = new Date();` };
    const code = `import { count } from '../store/contador.ts';\nimport { count as otra } from '../store/contador.ts';`;
    expect(cut('<p>@count @otra</p>', code, modules)).toEqual([`FUD1150 ${STORE}: count = new Date()`]);
  });
});
