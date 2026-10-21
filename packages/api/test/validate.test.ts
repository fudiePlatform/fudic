import type { SourceDiagnostic } from '@fudic/diagnostics';
import { describe, expect, it } from 'vitest';
import { createApiIndex, GLOBAL_ID, parseApi, validateApi } from '../src/index.js';
import { HTTP, USER_FORM, USUARIOS, inputs, slice } from './helpers.js';
import { BUILT_INS, app, check, codesOf, lib, route } from './project.js';

const lines = (...l: string[]): string => l.join('\n');

/** The only diagnostic of a check, with the text its span covers and the files of its related. */
function only(text: string, options?: Parameters<typeof check>[1]): {
  d: SourceDiagnostic;
  covered: string;
  related: readonly (readonly [string, string | undefined])[];
} {
  const { diagnostics } = check(text, options);
  if (diagnostics.length !== 1) throw new Error(`expected one, got ${diagnostics.map((d) => d.message).join('; ') || 'none'}`);
  const d = diagnostics[0]!;
  return {
    d,
    covered: slice(text, d.span),
    related: (d.related ?? []).map((r) => [r.message, r.file] as const),
  };
}

/** A file in the app whose declarations clash with or are used by the one checked. */
const PEOPLE = app('types/people', lines('type Person', '  name  str', 'enum Role', '  admin', '  user'));

describe('canonical files validate clean', () => {
  it('usuarios with `auth` declared', () => {
    const auth = app('middlewares/auth', 'middleware auth\n  server');
    expect(codesOf(USUARIOS, { id: 'routes/usuarios', ctx: route(), others: [auth] })).toEqual([]);
  });

  it('the global chain', () => {
    const log = app('middlewares/log', 'middleware log\n  client\n  server');
    expect(codesOf(HTTP, { id: GLOBAL_ID, others: [log] })).toEqual([]);
  });

  it('userForm with its rules and patterns', () => {
    const ext = app(
      'rules/user',
      lines(
        'rule alias-taken',
        '  on field str',
        '  runs server',
        '  async',
        '  fails alias-taken',
        'pattern email-loose  [^@\\s]+@[^@\\s]+\\.[^@\\s]+',
        'pattern web-url      https?://.+',
      ),
    );
    expect(codesOf(USER_FORM, { others: [ext] })).toEqual([]);
  });
});

describe('each validator code (criterion 8)', () => {
  it('FUD1080: an unknown type, with candidates', () => {
    const { d, covered } = only('type A\n  p  Persn', { others: [PEOPLE] });
    expect([d.code, covered]).toEqual(['FUD1080', 'Persn']);
    expect(d.message).toContain('`Person`');
  });

  it('FUD1080: `number` lists the widths', () => {
    const { d } = only('type A\n  n  number');
    expect(d.message).toContain('`u8`, `i8`, `u16`, `i16`, `u32`, `i32`, `f32`, `f64`');
  });

  it('FUD1080: `*` and `pattern` are types only inside a rule', () => {
    expect(codesOf('type A\n  x  *')).toEqual(['FUD1080']);
    expect(codesOf('type A\n  x  pattern')).toEqual(['FUD1080']);
    expect(codesOf('rule r\n  on field pattern\n  runs both\n  fails r')).toEqual(['FUD1080']);
    expect(codesOf('rule r\n  on field *\n  runs both\n  x  *\n  fails r')).toEqual(['FUD1080']);
    expect(codesOf('rule r\n  on field *[]\n  runs both\n  p  pattern\n  fails r')).toEqual([]);
  });

  it('FUD1080: an unknown middleware, form, rule and failure parameter', () => {
    expect(only('get f\n  use csrff').covered).toBe('csrff');
    expect(only('get f\n  use csrff').d.message).toContain('`csrf`');
    expect(only('put f\n  form persn').covered).toBe('persn');
    expect(only('form f\n  a  str\n    requird').covered).toBe('requird');
    const fail = only('rule r\n  on form\n  runs both\n  limit  u8\n  fails r limt');
    expect([fail.d.code, fail.covered]).toEqual(['FUD1080', 'limt']);
    expect(fail.d.message).toContain('`limit`');
    expect(codesOf('rule r\n  on form\n  runs both\n  limit  u8\n  fails r limit')).toEqual([]);
  });

  it('FUD1081: a project name the app repeats, on the later one, related to the first', () => {
    const { d, covered, related } = only('rule required\n  on field str\n  runs both\n  fails required');
    expect([d.code, covered]).toEqual(['FUD1081', 'required']);
    expect(related).toEqual([['declared here', '/app/node_modules/@fudic/forms/fudapi/rules.fudapi']]);
  });

  it('FUD1081: in the same file, with no file in its related', () => {
    const text = 'type A\n  x  str\nenum A\n  b';
    const { d, covered, related } = only(text);
    expect([d.code, covered, d.span.start]).toEqual(['FUD1081', 'A', text.lastIndexOf('A')]);
    expect(related).toEqual([['declared here', undefined]]);
  });

  it('FUD1081: the library declaration is never the one reported', () => {
    const checked = check('pattern email  x', { others: [] });
    expect(checked.diagnostics.map((d) => d.code)).toEqual(['FUD1081']);
    expect(slice('pattern email  x', checked.diagnostics[0]!.span)).toBe('email');
  });

  it('FUD1082: a function, a form or `load`/`paths`/`layout` twice in the file', () => {
    const text = 'get f\nput f';
    const { d, covered, related } = only(text);
    expect([d.code, covered, d.span.start]).toEqual(['FUD1082', 'f', text.lastIndexOf('f')]);
    expect(related).toEqual([['first here', undefined]]);
    expect(codesOf('load\nload', { ctx: route() })).toEqual(['FUD1082']);
    expect(codesOf('form f\n  a  str\nget f')).toEqual(['FUD1082']);
    expect(codesOf('paths\nlayout\npaths', { ctx: route('slug') })).toEqual(['FUD1082']);
  });

  it('FUD1082: a name twice in a block', () => {
    expect(only('type A\n  x  str\n  x  i32').covered).toBe('x');
    expect(codesOf('enum E\n  a\n  a')).toEqual(['FUD1082']);
    expect(codesOf('messages\n  x  "a"\n  x  "b"')).toEqual(['FUD1082']);
    expect(codesOf('get f\n  q  str\n  query q  str')).toEqual(['FUD1082']);
    expect(codesOf('rule r\n  on form\n  runs both\n  a  u8\n  a  u8\n  fails r')).toEqual(['FUD1082']);
    expect(codesOf('middleware m\n  client\n  a  u8\n  adds\n    u  str\n    u  str')).toEqual(['FUD1082']);
    expect(codesOf('load\n  a  str\n  a  str', { ctx: route() })).toEqual(['FUD1082']);
  });

  it('FUD1082: form members are unique per level, not across levels', () => {
    expect(codesOf('form f\n  a  str\n  g  group\n    a  str')).toEqual([]);
    expect(codesOf('form f\n  a  str\n  a  str')).toEqual(['FUD1082']);
    expect(codesOf('form f\n  g  group\n    a  str\n    a  str')).toEqual(['FUD1082']);
  });

  it('FUD1083: a rule that does not apply to the field type', () => {
    const { d, covered } = only('form f\n  a  str\n    min 3');
    expect([d.code, covered]).toEqual(['FUD1083', 'min']);
    expect(d.message).toContain('u8');
  });

  it('FUD1084: too many, too few and wrong arguments', () => {
    expect(only('form f\n  a  str\n    required 3').covered).toBe('required');
    const few = only('form f\n  a  str\n    min-length');
    expect([few.d.code, few.covered]).toEqual(['FUD1084', 'min-length']);
    expect(codesOf('form f\n  a  str\n    min-length "x"')).toEqual(['FUD1084']);
    expect(codesOf('form f\n  a  str\n    min-length -1')).toEqual(['FUD1084']);
    expect(only('form f\n  a  str\n    required 3').d.message).toContain('no arguments');
  });

  it('FUD1085: a placeholder the rule does not give, on the whole text', () => {
    const text = 'form f\n  a  str\n    min-length 3  "At least {n}, not {x}."';
    const { d, covered } = only(text);
    expect([d.code, covered]).toEqual(['FUD1085', '"At least {n}, not {x}."']);
    expect(d.message).toContain('{x}'.slice(1, 2));
  });

  it('FUD1085: only the first bad placeholder is reported', () => {
    expect(codesOf('form f\n  a  str\n    required  "{a} {b}"')).toEqual(['FUD1085']);
  });

  it('FUD1085: `{detail}` only for a server rule; `range` gives {min} and {max}; `require` nothing', () => {
    const server = app('r', 'rule taken\n  on field str\n  runs server\n  fails taken');
    expect(codesOf('form f\n  a  str\n    taken  "{detail}"', { others: [server] })).toEqual([]);
    expect(codesOf('form f\n  a  str\n    required  "{detail}"')).toEqual(['FUD1085']);
    expect(codesOf('form f\n  a  u8\n    range "{min}–{max}"')).toEqual([]);
    expect(codesOf('form f\n  a  u8\n    range "{n}"')).toEqual(['FUD1085']);
    expect(codesOf('form f\n  a  str\n  summary\n    require x  empty a  "{a}"')).toEqual(['FUD1085']);
    expect(only('form f\n  a  str\n    required  "{x}"').d.message).toContain('nothing');
  });

  it('FUD1086: a skip of a middleware the function does not inherit', () => {
    const { d, covered } = only('get f\n  skip csrf');
    expect([d.code, covered]).toEqual(['FUD1086', 'csrf']);
    const http = app(GLOBAL_ID, 'chain\n  use csrf');
    expect(codesOf('get f\n  skip csrf', { others: [http] })).toEqual([]);
    expect(codesOf('load\n  skip csrf', { others: [http], ctx: route() })).toEqual([]);
    expect(codesOf('chain\n  skip csrf', { others: [http] })).toEqual([]);
    expect(codesOf('get f\n  skip nope')).toEqual(['FUD1080']);
  });

  it('FUD1087: a missing, an extra and a mistyped parameter', () => {
    const missing = only('get f\n  use error-pages');
    expect([missing.d.code, missing.covered]).toEqual(['FUD1087', 'error-pages']);
    expect(missing.d.message).toContain('`routes`');
    expect(only('get f\n  use error-pages\n    routes  403 /entrar\n    other  1').covered).toBe('other');
    expect(only('get f\n  use error-pages\n    routes  abc /entrar').covered).toBe('routes');
    expect(codesOf('get f\n  use error-pages\n    routes  403')).toEqual(['FUD1087']);
    expect(codesOf('get f\n  use error-pages\n    routes  70000 /x')).toEqual(['FUD1087']);
  });

  it('FUD1087: a map takes one line per pair; anything else given twice is extra', () => {
    expect(codesOf('get f\n  use error-pages\n    routes  403 /entrar\n    routes  404 /no')).toEqual([]);
    const mw = app('m', lines('middleware limit', '  server', '  max  u16', '  tags  str[]', '  note  str?', '  role  Role'));
    const use = (...params: string[]): string => lines('get f', '  use limit', ...params.map((p) => `    ${p}`));
    expect(codesOf(use('max  10', 'tags', 'role  admin'), { others: [mw, PEOPLE] })).toEqual([]);
    expect(codesOf(use('max  10', 'max  11', 'tags', 'role  user'), { others: [mw, PEOPLE] })).toEqual(['FUD1087']);
    expect(codesOf(use('max  10', 'tags  a b "c"', 'note  x', 'role  user'), { others: [mw, PEOPLE] })).toEqual([]);
    expect(codesOf(use('max  10', 'tags  a 1', 'role  user'), { others: [mw, PEOPLE] })).toEqual(['FUD1087']);
    expect(codesOf(use('max  10', 'tags', 'role  boss'), { others: [mw, PEOPLE] })).toEqual(['FUD1087']);
    expect(codesOf(use('max  10', 'tags', 'role  admin user'), { others: [mw, PEOPLE] })).toEqual(['FUD1087']);
    expect(codesOf(use('tags', 'role  admin'), { others: [mw, PEOPLE] })).toEqual(['FUD1087']);
  });

  it('FUD1087: values of every primitive', () => {
    const mw = app('m', lines('middleware p', '  server', '  b  bool', '  d  date', '  u  uuid', '  f  f64', '  t  str[]?'));
    const ok = lines('get f', '  use p', '    b  true', '    d  "2026-01-01"', '    u  x', '    f  1.5', '    t  a b');
    expect(codesOf(ok, { others: [mw] })).toEqual([]);
    // The empty list is written `[]` everywhere, a middleware parameter included.
    expect(codesOf(lines('get f', '  use p', '    b  true', '    d  x', '    u  x', '    f  1', '    t  []'), { others: [mw] })).toEqual([]);
    // `[]` is the whole list or nothing: never mixed with elements, never twice.
    for (const t of ['[] a', 'a []', '[] []']) {
      expect(codesOf(lines('get f', '  use p', '    b  true', '    d  x', '    u  x', '    f  1', `    t  ${t}`), { others: [mw] })).toEqual(['FUD1087']);
    }    expect(codesOf(lines('get f', '  use p', '    b  1', '    d  x', '    u  x', '    f  1'), { others: [mw] })).toEqual(['FUD1087']);
    const unknownType = app('n', lines('middleware q', '  server', '  x  map str str', '  y  Ghost'));
    expect(codesOf(lines('get f', '  use q', '    x  a b', '    y  z'), { others: [unknownType] })).toEqual(['FUD1087']);
  });

  it('FUD1088: a type that holds itself through required fields', () => {
    const text = lines('type A', '  b  B', 'type B', '  c  C', '  s  str', 'type C', '  a  A');
    const { diagnostics } = check(text);
    expect(diagnostics.map((d) => [d.code, slice(text, d.span)])).toEqual([
      ['FUD1088', 'A'],
      ['FUD1088', 'B'],
      ['FUD1088', 'C'],
    ]);
    expect(diagnostics[0]!.message).toContain('A → B → C → A');
    expect(codesOf('type A\n  a  A')).toEqual(['FUD1088']);
  });

  it('FUD1088: not through `[]`, `?`, `map`, an enum or an unknown name', () => {
    expect(codesOf(lines('type A', '  a  A[]', '  b  A?', '  c  map str A', '  r  Role', '  p  Person'), { others: [PEOPLE] })).toEqual([]);
    expect(codesOf(lines('type A', '  b  B', '  c  B', 'type B', '  s  str'))).toEqual([]);
    expect(codesOf(lines('type A', '  b  B', 'type B', '  c  C', 'type C', '  b  B'))).toEqual(['FUD1088', 'FUD1088']);
  });

  it('FUD1089: a map key that is not text, uuid or an integer', () => {
    const { d, covered } = only('type A\n  m  map bool str');
    expect([d.code, covered]).toEqual(['FUD1089', 'bool']);
    expect(codesOf('type A\n  m  map Person str', { others: [PEOPLE] })).toEqual(['FUD1089']);
    expect(codesOf('type A\n  m  map str[] str')).toEqual(['FUD1089']);
    expect(codesOf('type A\n  m  map f64 str')).toEqual(['FUD1089']);
    expect(codesOf('type A\n  m  map Ghost str')).toEqual(['FUD1080']);
    expect(codesOf('type A\n  a  map uuid str\n  b  map u8 str\n  c  map i32 map str bool')).toEqual([]);
  });

  it('FUD1090: `load`, `paths` and `layout` outside a route sibling', () => {
    for (const keyword of ['load', 'paths', 'layout']) {
      const { d, covered } = only(keyword);
      expect([d.code, covered]).toEqual(['FUD1090', keyword]);
    }
    expect(codesOf('load\npaths\nlayout', { ctx: route('slug') })).toEqual([]);
  });

  it('FUD1091: `paths` in a route without parameters or in `_error`', () => {
    expect(only('paths', { ctx: route() }).d.code).toBe('FUD1091');
    const error = only('paths', { ctx: { route: { params: ['x'], error: true } } });
    expect([error.d.code, error.covered]).toEqual(['FUD1091', 'paths']);
    expect(error.d.message).not.toBe(only('paths', { ctx: route() }).d.message);
  });

  it('FUD1093: a `fails` code twice in one declaration', () => {
    const text = 'get f\n  fails gone 410\n  fails gone 404';
    const { d, related } = only(text);
    expect([d.code, d.span.start]).toEqual(['FUD1093', text.lastIndexOf('gone')]);
    expect(related).toEqual([['first here', undefined]]);
    expect(codesOf('load\n  fails a 404\n  fails a 410', { ctx: route() })).toEqual(['FUD1093']);
    expect(codesOf('rule r\n  on form\n  runs both\n  fails a\n  fails a')).toEqual(['FUD1093']);
    expect(codesOf('middleware m\n  client\n  fails a 403\n  fails a 401')).toEqual(['FUD1093']);
    expect(codesOf('get f\n  fails gone 410\nget g\n  fails gone 410')).toEqual([]);
  });

  it('FUD1096: a second `messages` in the project', () => {
    const first = lib('p', 'm', 'messages\n  x  "A."');
    const { d, covered, related } = only('messages\n  y  "B."', { others: [first] });
    expect([d.code, covered]).toEqual(['FUD1096', 'messages']);
    expect(related).toEqual([['the first `messages`', '/app/node_modules/p/fudapi/m.fudapi']]);
    const same = check('messages\n  y  "B."\nmessages\n  z  "C."').diagnostics;
    expect(same.map((x) => [x.code, x.related![0]!.file])).toEqual([['FUD1096', undefined]]);
  });

  it('FUD1097: a rule without `on`, `runs` or `fails`', () => {
    const { diagnostics } = check('rule r');
    expect(diagnostics.map((d) => [d.code, slice('rule r', d.span)])).toEqual([
      ['FUD1097', 'r'],
      ['FUD1097', 'r'],
      ['FUD1097', 'r'],
    ]);
    expect(diagnostics.map((d) => d.message.match(/`(on|runs|fails)`/u)![1])).toEqual(['on', 'runs', 'fails']);
  });

  it('FUD1098: a group rule under a field, a field rule in a summary', () => {
    const group = app('g', 'rule all-or-none\n  on group\n  runs both\n  fails all-or-none');
    const under = only('form f\n  a  str\n    all-or-none', { others: [group] });
    expect([under.d.code, under.covered]).toEqual(['FUD1098', 'all-or-none']);
    expect(codesOf('form f\n  a  str\n  summary\n    required')).toEqual(['FUD1098']);
    expect(codesOf('form f\n  g  group\n    a  str\n    summary\n      required')).toEqual(['FUD1098']);
    expect(codesOf('form f\n  g  group\n    a  str\n    summary\n      all-or-none', { others: [group] })).toEqual([]);
    expect(codesOf('form f\n  a  str\n  summary\n    all-or-none', { others: [group] })).toEqual(['FUD1098']);
  });

  it('a rule without `on` is reported where it is declared, not where it is used', () => {
    const loose = app('l', 'rule loose\n  runs both\n  fails loose');
    expect(codesOf('form f\n  a  str\n    loose\n  summary\n    loose', { others: [loose] })).toEqual([]);
  });

  it('FUD1099: a `:x` with no argument `x`', () => {
    const { d, covered } = only('put save /:id/x/:line\n  line  i32');
    expect([d.code, covered]).toEqual(['FUD1099', ':id']);
  });

  it('FUD1100: a route argument named like a page parameter', () => {
    const { d, covered } = only('put save /:slug\n  slug  str', { ctx: route('slug') });
    expect([d.code, covered]).toEqual(['FUD1100', 'slug']);
    expect(codesOf('put save\n  slug  str', { ctx: route('slug') })).toEqual([]);
    expect(codesOf('put save\n  query slug  str', { ctx: route('slug') })).toEqual([]);
  });

  it('FUD1101: a route argument that is optional or not scalar, a query argument not scalar', () => {
    const optional = only('put save /:id\n  id  i32?');
    expect([optional.d.code, optional.covered]).toEqual(['FUD1101', 'i32?']);
    expect(codesOf('put save /:id\n  id  str[]')).toEqual(['FUD1101']);
    expect(codesOf('put save\n  query p  Person', { others: [PEOPLE] })).toEqual(['FUD1101']);
    expect(codesOf('put save\n  query p  map str str')).toEqual(['FUD1101']);
    expect(codesOf('put save\n  query p  Person?', { others: [PEOPLE] })).toEqual(['FUD1101']);
    expect(only('put save /:id\n  id  i32?').d.message).not.toBe(only('put save /:id\n  id  str[]').d.message);
  });

  it('route and query arguments of every scalar are fine, and body arguments of any type', () => {
    const text = lines(
      'put save /:id/:role/:on',
      '  id  uuid',
      '  role  Role',
      '  on  date',
      '  query a1  bool?',
      '  query n  f32',
      '  body  Person[]',
      '  m  map str Person',
      '  -> Person',
    );
    expect(codesOf(text, { others: [PEOPLE] })).toEqual([]);
  });

  it('the types of returns, arguments and load fields are checked', () => {
    expect(codesOf('get f\n  -> Ghost')).toEqual(['FUD1080']);
    expect(codesOf('get f\n  x  Ghost')).toEqual(['FUD1080']);
    expect(codesOf('load\n  x  Ghost', { ctx: route() })).toEqual(['FUD1080']);
    expect(codesOf('middleware m\n  client\n  adds\n    u  Ghost')).toEqual(['FUD1080']);
    expect(codesOf('middleware m\n  client\n  x  Ghost')).toEqual(['FUD1080']);
  });

  it('a middleware without `adds`, a known form and a used middleware without parameters', () => {
    const person = app('forms/person', 'form person\n  name  str');
    expect(codesOf('put f\n  use csrf\n  form person', { others: [person] })).toEqual([]);
    expect(codesOf('middleware m\n  client')).toEqual([]);
  });

  it('never throws, over the sweep of broken inputs, and every span stays in its file', () => {
    for (const text of inputs()) {
      const source = { id: 'routes/x', path: '/x.fudapi', file: parseApi(text).value, origin: 'app' as const };
      for (const ctx of [{}, route('slug'), { route: { params: [], error: true } }]) {
        const diagnostics = validateApi(source, createApiIndex([...BUILT_INS, source]), ctx);
        for (const d of diagnostics) {
          expect(d.span.start >= 0 && d.span.start <= d.span.end && d.span.end <= text.length, JSON.stringify(text)).toBe(true);
        }
      }
    }
  });

  it('diagnostics come sorted by position', () => {
    const { diagnostics } = check('type A\n  x  Ghost\n  y  map bool str\nget f\n  use nope');
    expect(diagnostics.map((d) => d.span.start)).toEqual([...diagnostics.map((d) => d.span.start)].sort((a, b) => a - b));
  });
});
