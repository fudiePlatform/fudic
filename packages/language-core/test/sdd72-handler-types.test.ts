/**
 * SDD-72 — the handler receives the datum, and the editor types it on its own.
 *
 * `fudic:result` takes its type from what the `form:=` of the same element returns, as its
 * `.fudapi` declares it; `fudic:error` is an `Error`; a `bus:` name is typed by what its
 * receivers declare across the project, and an `emit` that sends something else is red where it
 * is written. All of it through the real checker over the projected corpus: a right error in the
 * wrong place is a wrong error, so every assertion says where it lands too.
 *
 * The types of `fudic:components/x-form` are written by hand, as the host would generate them
 * from `x-form.fudapi` (SDD-60 §3.11): this package reads no `.fudapi`, its host does.
 */

import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { languageServiceFor, typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

const describeDiag = (d: CorpusDiagnostic): string => `${d.fud} ${d.code} @${d.sourceText ?? '<unmapped>'}`;

/** The generated types of `x-form.fudapi`, with `save` returning `ret`. */
const contractTypes = (ret: string): string => `declare module 'fudic:components/x-form' {
  export interface Person { readonly id: number; readonly name: string }
  export function save(form: unknown): Promise<${ret}>;
  export function wipe(form: unknown): Promise<undefined>;
}
`;

/** `x-form.fud`, with `code` in its `@code` and `markup` in its shadow root. */
const xForm = (code: string, markup: string): string => `<link rel="server" href="./x-form.fudapi">

@code {
  import type { Person } from 'fudic:components/x-form';
${code}
}

<x-form>
  <template shadowrootmode="open">
    ${markup}
  </template>
</x-form>
`;

/** One more component, `tag`, with its own `@code` and markup. */
const another = (tag: string, code: string, markup: string): string => `@code {
${code}
}

<${tag}>
  <template shadowrootmode="open">
    ${markup}
  </template>
</${tag}>
`;

const CONTRACT = 'put save\n  -> Person\n\nput wipe\n';

/** The corpus plus `x-form` and its contract; `ret` is what `save` returns. */
function withForm(code: string, markup: string, ret = 'Person', more: Record<string, string> = {}): Record<string, string> {
  return {
    'components/x-form.fudapi': CONTRACT,
    'components/x-form-api.d.ts': contractTypes(ret),
    'components/x-form.fud': xForm(code, markup),
    ...more,
  };
}

/** The diagnostics of the files SDD-72 adds; the corpus around them is clean by itself. */
const added = (overrides: Record<string, string>): string[] =>
  typecheckCorpus(overrides)
    .filter((d) => d.fud.startsWith('components/x-') || d.fud.startsWith('components/bus-'))
    .map(describeDiag);

/** What the hover on the `nth` (0-based) occurrence of `needle` in `file` says. */
function hoverOn(overrides: Record<string, string>, file: string, needle: string, nth = 0): string {
  const { service, pathOf, projected } = languageServiceFor(overrides);
  const entry = projected.find(({ file: f }) => f.path === file)!;
  let at = -1;
  for (let i = 0; i <= nth; i++) at = entry.file.source.indexOf(needle, at + 1);
  expect(at, `${needle} is in ${file}`).toBeGreaterThan(-1);
  for (const virtual of entry.virtuals) {
    for (const m of virtual.mappings) {
      if (at < m.sourceOffset || at >= m.sourceOffset + m.sourceLength) continue;
      const info = service.getQuickInfoAtPosition(pathOf(virtual.fileName), m.generatedOffset + (at - m.sourceOffset));
      if (info !== undefined) return ts.displayPartsToString(info.displayParts);
    }
  }
  throw new Error(`no hover on ${needle}`);
}

describe('fudic:result — typed by the form:= of the same element (criteria 10–14)', () => {
  const HECHO = '  function hecho(persona: Person) { void persona.name; }';
  const FORM = '<form form:=@save @fudic:result=@hecho></form>';

  it('a handler that takes what save returns is clean, and its parameter is a Person (criterion 10)', () => {
    const overrides = withForm(HECHO, FORM);
    expect(added(overrides)).toEqual([]);
    expect(hoverOn(overrides, 'components/x-form.fud', 'persona')).toContain('Person');
  });

  it('a handler that takes something else is TS2345 on the value @hecho (criterion 11)', () => {
    const diags = added(withForm('  function hecho(persona: number) { void persona; }', FORM));
    expect(diags).toEqual(['components/x-form.fud 2345 @hecho']);
  });

  it('and the type comes from the contract: if save returns number, the same handler is clean (criterion 11)', () => {
    expect(added(withForm('  function hecho(persona: number) { void persona; }', FORM, 'number'))).toEqual([]);
    // And the Person handler is the one that breaks now.
    expect(added(withForm(HECHO, FORM, 'number'))).toEqual(['components/x-form.fud 2345 @hecho']);
  });

  it('a function with no -> gives undefined', () => {
    const wiped = '  function hecho(v: undefined) { void v; }';
    expect(added(withForm(wiped, '<form form:=@wipe @fudic:result=@hecho></form>'))).toEqual([]);
  });

  it('a lambda is contextually typed: p is a Person (criterion 12)', () => {
    const overrides = withForm('', '<form form:=@save @fudic:result=@(p => p.name)></form>');
    expect(added(overrides)).toEqual([]);
    expect(hoverOn(overrides, 'components/x-form.fud', 'p =>')).toContain('Person');
  });

  it('a call gets $event, and its detail is a Person (criterion 13)', () => {
    const overrides = withForm(HECHO, '<form form:=@save @fudic:result=@hecho($event.detail)></form>');
    expect(added(overrides)).toEqual([]);
    expect(hoverOn(overrides, 'components/x-form.fud', 'detail')).toContain('Person');
  });

  it('a call that passes the event where a Person is expected is red', () => {
    const diags = added(withForm(HECHO, '<form form:=@save @fudic:result=@hecho($event)></form>'));
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatch(/ 2345 @\$event$/u);
  });

  it('on an element without form:= the datum is unknown (criterion 14)', () => {
    const div = '<div @fudic:result=@f></div>';
    expect(added(withForm('  function f(v: Person) { void v; }', div))).toEqual(['components/x-form.fud 2345 @f']);
    expect(added(withForm('  function f(v: unknown) { void v; }', div))).toEqual([]);
  });
});

describe('fudic:error — always an Error (criterion 15)', () => {
  it('a handler of Error is clean; one of a narrower error is TS2345 on the value', () => {
    const narrow = '  class HttpError extends Error { status = 0; }\n  function fallo(e: HttpError) { void e.status; }';
    expect(added(withForm('  function fallo(e: Error) { void e.message; }', '<form form:=@save @fudic:error=@fallo></form>'))).toEqual([]);
    expect(added(withForm(narrow, '<form form:=@save @fudic:error=@fallo></form>'))).toEqual([
      'components/x-form.fud 2345 @fallo',
    ]);
  });

  it('a call gets a CustomEvent<Error>', () => {
    const overrides = withForm('  function fallo(e: Error) { void e; }', '<div @fudic:error=@fallo($event.detail)></div>');
    expect(added(overrides)).toEqual([]);
  });
});

describe('the form:= is mapped once (criterion 16)', () => {
  it('the save of form:= is one stretch of the virtual, not two', () => {
    const overrides = withForm('  function hecho(persona: Person) { void persona; }', '<form form:=@save @fudic:result=@hecho></form>');
    const { projected } = languageServiceFor(overrides);
    const entry = projected.find(({ file }) => file.path === 'components/x-form.fud')!;
    const at = entry.file.source.indexOf('save @fudic');
    const covering = entry.virtuals.flatMap((v) =>
      v.mappings.filter((m) => m.sourceOffset <= at && at < m.sourceOffset + m.sourceLength && m.caps.navigation),
    );
    expect(covering).toHaveLength(1);
  });

  it('and go-to-definition on it answers what it answers without the fudic:result', () => {
    /** Every definition answered on the `save` of `markup`'s form:=, as `file:start`. */
    const definitions = (markup: string): string[] => {
      const overrides = withForm('  function hecho(persona: Person) { void persona; }', markup);
      const { service, pathOf, projected } = languageServiceFor(overrides);
      const entry = projected.find(({ file }) => file.path === 'components/x-form.fud')!;
      const at = entry.file.source.indexOf('save');
      return entry.virtuals.flatMap((v) =>
        v.mappings
          .filter((m) => m.sourceOffset <= at && at < m.sourceOffset + m.sourceLength)
          .flatMap((m) => service.getDefinitionAtPosition(pathOf(v.fileName), m.generatedOffset + (at - m.sourceOffset)) ?? [])
          .map((d) => `${d.fileName}:${String(d.textSpan.start)}`),
      );
    };
    const alone = definitions('<form form:=@save></form>');
    expect(alone.length).toBeGreaterThan(0);
    expect(definitions('<form form:=@save @fudic:result=@hecho></form>')).toEqual(alone);
  });
});

/** A component that emits `call` from a click. */
const emitter = (call: string, code = ''): string =>
  another(
    'bus-sender',
    `  import { emit } from '@fudic/dom';\n  type Person = { readonly id: number; readonly name: string };\n  const persona: Person = { id: 1, name: 'a' };\n${code}\n  function go() { void persona; ${call}; }`,
    '<button @click=@go()>go</button>',
  );

/** A component that receives `name` with `fn`, declared in its `@code` as `code`. */
const receiver = (tag: string, code: string, markup: string): string => another(tag, code, markup);

const ALTA = receiver(
  'bus-alta',
  '  type Person = { readonly id: number; readonly name: string };\n  function alta(persona: Person) { void persona; }',
  '<div bus:alta=@alta></div>',
);

const busCorpus = (files: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [name, text] of Object.entries(files)) out[`components/${name}.fud`] = text;
  return out;
};

describe('the bus — typed by its receivers (criteria 17–25)', () => {
  it('an emit of what the receiver takes is clean; another type is TS2345 on the argument (criterion 17)', () => {
    expect(added(busCorpus({ 'bus-alta': ALTA, 'bus-sender': emitter('emit("alta", persona)') }))).toEqual([]);
    expect(added(busCorpus({ 'bus-alta': ALTA, 'bus-sender': emitter('emit("alta", "x")') }))).toEqual([
      'components/bus-sender.fud 2345 @"x"',
    ]);
  });

  it('two receivers sum up: the emitter has to satisfy both (criterion 18)', () => {
    const otro = receiver('bus-otro', '  function otro(p: { name: string }) { void p; }', '<div bus:alta=@otro></div>');
    expect(added(busCorpus({ 'bus-alta': ALTA, 'bus-otro': otro, 'bus-sender': emitter('emit("alta", persona)') }))).toEqual([]);
    const partial = added(busCorpus({ 'bus-alta': ALTA, 'bus-otro': otro, 'bus-sender': emitter('emit("alta", { name: "a" })') }));
    expect(partial).toHaveLength(1);
    expect(partial[0]).toMatch(/^components\/bus-sender\.fud 2345 /u);
  });

  it('receivers no value satisfies make the emit red, and no receiver is TS2717 (criterion 19)', () => {
    const num = receiver('bus-otro', '  function otro(n: number) { void n; }', '<div bus:alta=@otro></div>');
    const diags = typecheckCorpus(busCorpus({ 'bus-alta': ALTA, 'bus-otro': num, 'bus-sender': emitter('emit("alta", persona)') }));
    expect(diags.map((d) => d.code)).not.toContain(2717);
    expect(diags.filter((d) => d.fud.startsWith('components/bus-')).map((d) => `${d.fud} ${d.code}`)).toEqual([
      'components/bus-sender.fud 2345',
    ]);
  });

  it('a receiver with no parameters takes anything and nothing (criterion 20)', () => {
    const ping = receiver('bus-ping', '  function onPing() {}', '<div bus:ping=@onPing></div>');
    expect(added(busCorpus({ 'bus-ping': ping, 'bus-sender': emitter('emit("ping"); emit("ping", 3)') }))).toEqual([]);
  });

  it('a name nobody receives takes anything and nothing (criterion 21)', () => {
    expect(added(busCorpus({ 'bus-sender': emitter('emit("nadie", 42); emit("nadie")') }))).toEqual([]);
  });

  it('every receiver that admits undefined makes the detail optional', () => {
    const opt = receiver('bus-opt', '  function onOpt(n?: number) { void n; }', '<div bus:opt=@onOpt></div>');
    expect(added(busCorpus({ 'bus-opt': opt, 'bus-sender': emitter('emit("opt"); emit("opt", 1)') }))).toEqual([]);
    expect(added(busCorpus({ 'bus-alta': ALTA, 'bus-sender': emitter('emit("alta")') }))).toHaveLength(1);
  });

  it('a lambda registers nothing, and is typed by the others or unknown (criterion 22)', () => {
    const lambda = receiver('bus-lambda', '', '<div bus:alta=@(p => p.name)></div>');
    expect(added(busCorpus({ 'bus-alta': ALTA, 'bus-lambda': lambda }))).toEqual([]);
    const alone = added(busCorpus({ 'bus-lambda': lambda }));
    expect(alone).toHaveLength(1);
    // `p` is unknown: TS18046 on it.
    expect(alone).toEqual(['components/bus-lambda.fud 18046 @p']);
    // It registered nothing: the emitter is free.
    expect(added(busCorpus({ 'bus-lambda': lambda, 'bus-sender': emitter('emit("alta", 42)') })).filter((d) => d.includes('bus-sender'))).toEqual([]);
  });

  it('bus:(expr) is any and registers nothing (criterion 23)', () => {
    const dyn = receiver(
      'bus-dyn',
      "  type Person = { readonly id: number; readonly name: string };\n  const NOMBRE = 'alta';\n  function f(x: Person) { void x; }",
      '<div bus:(NOMBRE)=@f></div>',
    );
    expect(added(busCorpus({ 'bus-dyn': dyn, 'bus-sender': emitter('emit("alta", 42)') }))).toEqual([]);
  });

  it('a call keeps $event, typed by the receivers', () => {
    const viaCall = receiver('bus-call', '  function log(e: CustomEvent) { void e; }', '<div bus:alta=@log($event)></div>');
    expect(added(busCorpus({ 'bus-alta': ALTA, 'bus-call': viaCall }))).toEqual([]);
  });

  it('a @code without imports and a typed bus: still projects clean (criterion 24)', () => {
    const plain = receiver('bus-plain', '  function onPing(n: number) { void n; }', '<div bus:ping=@onPing></div>');
    expect(added(busCorpus({ 'bus-plain': plain }))).toEqual([]);
  });

  it('a loop variable that shadows the name registers nothing and finds its name (criterion 25)', () => {
    const looped = receiver(
      'bus-loop',
      '  const handlers = [(x: unknown) => x];',
      '@foreach (const alta of handlers) {\n      <div bus:alta=@alta></div>\n    }',
    );
    const diags = typecheckCorpus(busCorpus({ 'bus-loop': looped, 'bus-sender': emitter('emit("alta", 42)') }));
    expect(diags.filter((d) => d.fud.startsWith('components/bus-')).map(describeDiag)).toEqual([]);
    expect(diags.some((d) => /Cannot find name/u.test(d.message))).toBe(false);
  });
});
