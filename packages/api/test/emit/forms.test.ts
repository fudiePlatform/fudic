/**
 * SDD-60 §3.6, §4.3 and criteria 12, 13 and 37 (the form's half) — the forms generated from a
 * `.fudapi`, evaluated, against the ones written by hand today.
 *
 * The built-in rules get their checks here, from today's validators: their implementations
 * arrive with the built-ins (phase 6), and borrowing today's is exactly what makes the verdicts
 * comparable. Bytes are compared on `person` only: `userForm` and `wideForm` are untyped today
 * (JSON) and typed once generated (binary), so their values are compared instead.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AnyForm } from '@fudic/forms';
import { max, maxLength, min, minLength, pattern, required, setMessages } from '@fudic/forms/contract';
import { binWire } from '@fudic/http/wire/bin';
import { formTypes } from '@fudic/http/wire';
import type { Rule } from '@fudic/forms/contract';
import { project } from './_project.js';
import { load, type Loaded } from './_load.js';
import { personForm, taken, userForm, wideForm } from './_today.js';

type AnyRule = Rule<never, never, never>;
type Checks = Readonly<Record<string, (v: never, p: never) => boolean | Promise<boolean>>>;

const p = project();
const sources = Object.values(p.sources);

/** Today's validators as the verdicts of the built-in rules. */
const BUILT_INS: Checks = {
  required: (v: unknown) => required(v, undefined as never) === null,
  min: (v: number | null, q: { n: number }) => min(q.n)(v, undefined as never) === null,
  max: (v: number | null, q: { n: number }) => max(q.n)(v, undefined as never) === null,
  minLength: (v: string, q: { n: number }) => minLength(q.n)(v, undefined as never) === null,
  maxLength: (v: string, q: { n: number }) => maxLength(q.n)(v, undefined as never) === null,
  pattern: (v: string, q: { regex: RegExp }) => pattern(q.regex)(v, undefined as never) === null,
};

/** The data layer of the server-only rules. */
const SERVER: Checks = {
  emailTaken: async (v: string) => !taken.has(v),
  aliasTaken: async (v: string) => !taken.has(v),
};

async function side(s: 'server' | 'browser'): Promise<Loaded> {
  const loaded = load(p.index, sources, s, (source) => p.ctx[source.id] ?? {});
  const rules = await loaded.module<Record<string, AnyRule>>('@fudic/forms/rules');
  for (const [name, check] of Object.entries(BUILT_INS)) rules[name]!.check(check as never);
  if (s === 'server') {
    const own = await loaded.module<Record<string, AnyRule>>('rules/forms');
    for (const [name, check] of Object.entries(SERVER)) own[name]!.check(check as never);
  }
  return loaded;
}

let server: Loaded;
let browser: Loaded;

beforeAll(async () => {
  server = await side('server');
  browser = await side('browser');
});
afterEach(() => taken.clear());
afterAll(() => setMessages({}));

/** A generated form, fresh. */
async function generated(loaded: Loaded, id: string, name: string): Promise<AnyForm> {
  const mod = await loaded.module<Record<string, AnyForm>>(id);
  return mod[name]!.$fresh();
}

/** Every reading criterion 12 compares, after a validation on `which` side. */
async function readings(f: AnyForm, value: unknown, which: 'server' | 'browser') {
  f.$set(value as never);
  const valid = await f.$validate(which === 'server' ? { server: true } : {});
  f.$touch();
  const messages: Record<string, string> = {};
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const name of (node as unknown as AnyForm).$fields()) {
      const child = node[name] as Record<string, unknown> & { message?: () => string };
      const path = prefix + name;
      if (typeof child['$fields'] === 'function') {
        messages[path] = (child as unknown as AnyForm).$message();
        walk(child, `${path}.`);
      } else messages[path] = child.message!();
    }
  };
  walk(f as unknown as Record<string, unknown>, '');
  return {
    valid,
    failing: Object.keys(f.$errors() ?? {}).sort(),
    summary: f.$messages(),
    messages,
    issues: f.$issues().map((i) => `${i.path}: ${i.message}`),
    fields: f.$fields(),
    value: f.$value(),
    positional: f.$positional(),
  };
}

/** The same battery through today's form and the generated one, on both sides. */
async function same(today: () => AnyForm, id: string, name: string, battery: readonly unknown[], setup: (v: unknown) => void = () => {}) {
  for (const value of battery) {
    for (const which of ['browser', 'server'] as const) {
      setup(value);
      const mine = await readings(await generated(which === 'server' ? server : browser, id, name), value, which);
      const theirs = await readings(today(), value, which);
      expect(mine, `${which} ${JSON.stringify(value)}`).toEqual(theirs);
      taken.clear();
    }
  }
}

describe('criterion 12: the forms of examples/basic, generated', () => {
  it('person: verdicts, messages, issues, order and bytes', async () => {
    const battery = [
      { name: '', email: '', age: null, active: true, notes: '' },
      { name: 'Ana', email: 'nope', age: 17, active: false, notes: 'x' },
      { name: 'Ana', email: 'ana@x.es', age: 121, active: true, notes: '' },
      { name: 'Ana', email: 'ana@x.es', age: 40, active: true, notes: 'una nota' },
      { name: 'Ana', email: 'taken@x.es', age: 40, active: true, notes: '' },
    ];
    await same(personForm, 'forms/person', 'person', battery, (v) => {
      if ((v as { email: string }).email === 'taken@x.es') taken.add('taken@x.es');
    });

    // What the comparison saw is not empty: the readings carry the texts of the `.fudapi`.
    const empty = await readings(await generated(server, 'forms/person', 'person'), battery[0], 'server');
    expect(empty).toMatchObject({ valid: false, failing: ['age', 'email', 'name'] });
    expect(empty.messages).toMatchObject({ name: 'Escribe el nombre.', email: 'Escribe el email.', age: 'Escribe la edad.' });
    const young = await readings(await generated(browser, 'forms/person', 'person'), battery[1], 'browser');
    expect(young.messages).toMatchObject({ email: 'Ese email no parece válido.', age: 'Tiene que tener al menos 18 años.' });
    taken.add('taken@x.es');
    const busy = await readings(await generated(server, 'forms/person', 'person'), battery[4], 'server');
    expect(busy.messages['email']).toBe('Ese email ya lo usa otra persona.');
    const local = await readings(await generated(browser, 'forms/person', 'person'), battery[4], 'browser');
    expect(local.valid).toBe(true);

    for (const value of battery) {
      const mine = await generated(server, 'forms/person', 'person');
      const theirs = personForm();
      mine.$set(value as never);
      theirs.$set(value as never);
      const bytes = (f: AnyForm) => binWire.encodeArgs(formTypes(f.$schema), f.$value() as never);
      expect(bytes(mine)).toEqual(bytes(theirs));
    }
  });

  it('person: a number out of its width is refused alike', async () => {
    const mine = await generated(browser, 'forms/person', 'person');
    const theirs = personForm();
    const outcome = (f: AnyForm) => {
      try {
        f.$set({ name: 'A', email: 'a@b.c', age: 300, active: true, notes: '' } as never);
        return f.$errors();
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(outcome(mine)).toEqual(outcome(theirs));
  });

  it('userForm: required in a group, its summary and the server rule', async () => {
    const empty = { name: '', alias: '', email: '', web: '', acceso: { clave: '', repetir: '' } };
    const battery = [
      empty,
      { name: 'ana', alias: 'ana', email: 'ana@x.es', web: '', acceso: { clave: 'secreto-ana', repetir: 'secreto-ana' } },
      { name: 'ana', alias: 'an', email: 'nope', web: 'ftp://x', acceso: { clave: 'corta', repetir: 'otra' } },
      { name: 'ana', alias: 'anita', email: 'ana@x.es', web: 'https://ana.es', acceso: { clave: 'larguisima', repetir: 'larguisima' } },
      { name: 'ana', alias: 'cogido', email: 'ana@x.es', web: '', acceso: { clave: 'larguisima', repetir: 'larguisima' } },
      { name: '', alias: 'pepe', email: '', web: '', acceso: { clave: 'x', repetir: '' } },
    ];
    await same(userForm, 'components/user-form', 'userForm', battery, (v) => {
      if ((v as { alias: string }).alias === 'cogido') taken.add('cogido');
    });

    const both = await readings(await generated(browser, 'components/user-form', 'userForm'), battery[1], 'browser');
    expect(both.summary).toEqual(['El alias no puede ser tu nombre.', 'La contraseña no puede contener tu nombre.']);
    const short = await readings(await generated(browser, 'components/user-form', 'userForm'), battery[2], 'browser');
    expect(short.messages).toMatchObject({
      alias: 'El alias necesita al menos 3 caracteres.',
      web: 'La web empieza por http:// o https://.',
      acceso: 'Las contraseñas no coinciden.',
      'acceso.clave': 'Mínimo 8 caracteres.',
    });
    const group = await readings(await generated(browser, 'components/user-form', 'userForm'), battery[5], 'browser');
    expect(group.messages['acceso.repetir']).toBe('Repite la contraseña.');
  });

  it('wideForm', async () => {
    const blank = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`a${String(i + 1)}`, '']));
    await same(wideForm, 'forms/wide', 'wideForm', [blank, { ...blank, a1: 'x', a2: 'y' }, { ...blank, a1: 'x', a2: 'yz', a12: 'fin' }]);
  });
});

describe('criterion 13: a pattern is anchored', () => {
  it('web-url rejects xhttp://a and accepts http://a; the empty value passes', async () => {
    const { webUrl } = await server.module<{ webUrl: RegExp }>('rules/forms');
    expect(webUrl.test('xhttp://a')).toBe(false);
    expect(webUrl.test('http://a')).toBe(true);
    const f = await generated(server, 'components/user-form', 'userForm');
    const web = (f as unknown as Record<string, { set(v: string): void; errors(): unknown }>)['web']!;
    for (const [value, errors] of [
      ['xhttp://a', { pattern: true }],
      ['http://a', null],
      ['', null],
    ] as const) {
      web.set(value);
      await f.$validate();
      expect(web.errors()).toEqual(errors);
    }
  });
});
