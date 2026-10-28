import { describe, expect, it } from 'vitest';
import { parseApi, type Decl } from '../src/index.js';
import { codes, slice } from './helpers.js';

type Of<K extends Decl['kind']> = Extract<Decl, { kind: K }>;

function first<K extends Decl['kind']>(source: string, kind: K): Of<K> {
  const decl = parseApi(source).value.declarations[0];
  expect(decl?.kind).toBe(kind);
  return decl as Of<K>;
}

const lines = (...l: string[]): string => l.join('\n');

describe('functions', () => {
  it('an argument of the route, of query or of the body takes rules below it, as a field (SDD-67 §3.5)', () => {
    const source = lines(
      'put save /:id',
      '  id      uuid',
      '  name    str',
      '    required',
      '    max-length 80',
      '  age     u8',
      '    min 18                "Too young."',
      '  query search str',
      '    min-length 2',
    );
    expect(codes(source)).toEqual([]);
    const fn = first(source, 'fn');
    const rules = fn.args.map((a) => [a.name.text, a.rules.map((r) => [r.name.text, r.args.map((x) => slice(source, x.span)), r.text?.text])]);
    expect(rules).toEqual([
      ['id', []],
      ['name', [['required', [], undefined], ['max-length', ['80'], undefined]]],
      ['age', [['min', ['18'], 'Too young.']]],
      ['search', [['min-length', ['2'], undefined]]],
    ]);
    const age = fn.args[2]!;
    expect(slice(source, age.rules[0]!.span)).toBe('min 18                "Too young."');
    // An argument with rules spans its block; one without, its line.
    expect(slice(source, age.span)).toBe('age     u8\n    min 18                "Too young."');
    expect(slice(source, fn.args[0]!.span)).toBe('id      uuid');
  });

  it('place each argument by the route and `query` (SDD §3.3)', () => {
    const source = lines(
      'put save /:id/lines/:line',
      '  id      uuid',
      '  line    i32',
      '  query notify  bool?',
      '  active  bool',
    );
    expect(codes(source)).toEqual([]);
    const fn = first(source, 'fn');
    expect(fn.verb).toBe('put');
    expect(fn.route!.segments.map((s) => [s.kind, s.text, slice(source, s.span)])).toEqual([
      ['param', 'id', ':id'],
      ['literal', 'lines', 'lines'],
      ['param', 'line', ':line'],
    ]);
    expect(fn.args.map((a) => [a.name.text, a.place])).toEqual([
      ['id', 'route'],
      ['line', 'route'],
      ['notify', 'query'],
      ['active', 'body'],
    ]);
    expect(slice(source, fn.args[2]!.query!)).toBe('query');
    expect(fn.args[0]).not.toHaveProperty('query');
  });

  it('`form` with route and query arguments is fine; with a body argument, FUD1072', () => {
    expect(codes('put save /:id\n  form f\n  id  i32\n  query n  bool')).toEqual([]);
    expect(codes('put save\n  form f\n  active  bool')).toEqual(['FUD1072']);
    expect(first('put save /:id\n  form f\n  id  i32', 'fn').form!.name.text).toBe('f');
  });

  it('reads every clause', () => {
    const source = lines(
      'delete drop',
      '  use auth log',
      '    level  2 "x"',
      '  skip csrf',
      '  skip *',
      '  invalidates /usuarios /blog/:slug /',
      '  compress deflate-raw 512',
      '  fails gone 410 "Gone."',
      '  fails busy 409',
      '  m  map str map u8 bool',
      '  -> Person?',
    );
    expect(codes(source)).toEqual([]);
    const fn = first(source, 'fn');
    expect(fn.uses[0]!.middlewares.map((m) => [m.name.text, m.args.map((a) => a.name.text)])).toEqual([
      ['auth', []],
      ['log', ['level']],
    ]);
    expect(fn.uses[0]!.middlewares[1]!.args[0]!.values.map((v) => v.kind)).toEqual(['number', 'string']);
    expect(fn.skips.map((s) => [s.middlewares.map((m) => m.text), s.all !== undefined])).toEqual([
      [['csrf'], false],
      [[], true],
    ]);
    expect(fn.invalidates[0]!.routes.map((r) => r.text)).toEqual(['/usuarios', '/blog/:slug', '/']);
    expect(fn.compress!.encoding!.text).toBe('deflate-raw');
    expect(fn.compress!.min!.value).toBe(512);
    expect(fn.fails.map((f) => [f.code.text, f.status.value, f.detail?.text])).toEqual([
      ['gone', 410, 'Gone.'],
      ['busy', 409, undefined],
    ]);
    const m = fn.args[0]!.type;
    expect(m.kind === 'map' && m.value.kind === 'map' && slice(source, m.value.span)).toBe('map u8 bool');
    expect(fn.returns!.type.kind).toBe('optional');
  });

  it('`compress off`, alone and with something after it', () => {
    expect(first('get f\n  compress off', 'fn').compress).toHaveProperty('off');
    expect(codes('get f\n  compress off now')).toEqual(['FUD1064']);
    expect(codes('get f\n  compress gzip 1 2')).toEqual(['FUD1064']);
    expect(first('get f\n  compress gzip', 'fn').compress).not.toHaveProperty('min');
  });

  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['a verb with no name', 'get', ['FUD1063']],
    ['a function name with the wrong shape', 'get my-fn', ['FUD1070']],
    ['a route with a bad segment', 'get f /:id/Bad', ['FUD1068']],
    ['a route with an empty segment', 'get f //x', ['FUD1068']],
    ['two words after the route', 'get f /x y', ['FUD1064']],
    ['a second `form`', 'get f\n  form a\n  form b', ['FUD1071']],
    ['`form` with no name', 'get f\n  form', ['FUD1063']],
    ['`form` with two names', 'get f\n  form a b', ['FUD1064']],
    ['a line under `form`', 'get f\n  form a\n    x', ['FUD1065']],
    ['`invalidates` alone', 'get f\n  invalidates', ['FUD1063']],
    ['`invalidates` a word', 'get f\n  invalidates /a nope', ['FUD1068']],
    ['a second `compress`', 'get f\n  compress gzip\n  compress off', ['FUD1071']],
    ['`compress` alone', 'get f\n  compress', ['FUD1075']],
    ['a line under `compress`', 'get f\n  compress off\n    x', ['FUD1065']],
    ['`fails` alone', 'get f\n  fails', ['FUD1063']],
    ['`fails` with no status', 'get f\n  fails x', ['FUD1068']],
    ['`fails` with a word for its detail', 'get f\n  fails x 409 nope', ['FUD1064']],
    ['`fails` with a code in the wrong shape', 'get f\n  fails Taken 409', ['FUD1070']],
    ['a line under `fails`', 'get f\n  fails x 409\n    y', ['FUD1065']],
    ['`query` alone', 'get f\n  query', ['FUD1063']],
    ['`query` with no type', 'get f\n  query q', ['FUD1067']],
    ['`query` with a word after its type', 'get f\n  query q str x', ['FUD1064']],
    ['a second `->`', 'get f\n  -> str\n  -> str', ['FUD1071']],
    ['`->` alone', 'get f\n  ->', ['FUD1067']],
    ['`->` with a broken type', 'get f\n  -> str[', ['FUD1067']],
    ['`->` with a word after its type', 'get f\n  -> str x', ['FUD1064']],
    ['`use` alone', 'get f\n  use', ['FUD1063']],
    ['`use` of a name in the wrong shape', 'get f\n  use Auth', ['FUD1070']],
    ['a `use` parameter in the wrong shape', 'get f\n  use x\n    my-param  1', ['FUD1070']],
    ['`skip` alone', 'get f\n  skip', ['FUD1063']],
    ['`skip *` and more', 'get f\n  skip * x', ['FUD1064']],
    ['a line under `skip`', 'get f\n  skip x\n    y', ['FUD1065']],
    ['an argument with a broken map', 'get f\n  m  map str', ['FUD1067']],
    ['an argument with a bare map', 'get f\n  m  map', ['FUD1067']],
    ['an argument whose map key is not a type', 'get f\n  m  map [ str', ['FUD1067']],
    ['an argument in the wrong shape', 'get f\n  1x  str', ['FUD1065']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(codes(source)).toEqual(expected);
    });
  }

  it('keeps the first of a repeated clause', () => {
    const fn = first('get f\n  -> str\n  -> i32\n  form a\n  form b\n  compress gzip\n  compress off', 'fn');
    expect(fn.returns!.type.kind === 'named' && fn.returns!.type.name.text).toBe('str');
    expect(fn.form!.name.text).toBe('a');
    expect(fn.compress!.encoding!.text).toBe('gzip');
  });

  it('a bad status or a bad argument type drops only that line', () => {
    const fn = first('get f\n  fails x 200\n  fails y 409\n  a  str[\n  b  str', 'fn');
    expect(fn.fails.map((f) => f.code.text)).toEqual(['y']);
    expect(fn.args.map((a) => a.name.text)).toEqual(['b']);
  });
});

describe('load', () => {
  it('reads its whole line (SDD §3.4)', () => {
    const source = 'load sw ttl 5m stale-while-revalidate page persist 1h';
    expect(codes(source)).toEqual([]);
    const load = first(source, 'load');
    expect(load.mode!.text).toBe('sw');
    expect([load.ttl!.text, load.ttl!.ms]).toEqual(['5m', 300_000]);
    expect(load.policy!.text).toBe('stale-while-revalidate');
    expect([load.page!.value.text, load.page!.duration!.ms]).toEqual(['persist', 3_600_000]);
    expect(slice(source, load.page!.span)).toBe('page persist 1h');
  });

  it('reads durations in seconds and days, and `page never` with none', () => {
    expect(first('load ttl 30s', 'load').ttl!.ms).toBe(30_000);
    expect(first('load ttl 2d', 'load').ttl!.ms).toBe(172_800_000);
    const load = first('load page never network-only', 'load');
    expect(load.page).not.toHaveProperty('duration');
    expect(slice('load page never network-only', load.page!.span)).toBe('page never');
    expect(load.policy!.text).toBe('network-only');
  });

  it('a bare `load` has no options', () => {
    const load = first('load', 'load');
    for (const key of ['mode', 'ttl', 'policy', 'page']) expect(load).not.toHaveProperty(key);
  });

  it('reads `use`, `skip`, `fails` and fields below it', () => {
    const load = first('load\n  use auth\n  skip log\n  fails gone 404\n  users  Person[]', 'load');
    expect([load.uses.length, load.skips.length, load.fails.length, load.fields.length]).toEqual([1, 1, 1, 1]);
  });

  const broken: readonly (readonly [string, string, readonly string[]])[] = [
    ['two modes', 'load ssr ssg', ['FUD1071']],
    ['two policies', 'load cache-first network-first', ['FUD1071']],
    ['`ttl` at the end', 'load ttl', ['FUD1074']],
    ['`ttl` with no duration', 'load ttl soon', ['FUD1074']],
    ['two `ttl`', 'load ttl 1m ttl 2m', ['FUD1071']],
    ['`page` at the end', 'load page', ['FUD1074']],
    ['`page` with a bad value', 'load page always', ['FUD1074']],
    ['two `page`', 'load page never page persist', ['FUD1071']],
    ['an unknown option', 'load fast', ['FUD1074']],
    ['an unknown clause below', 'load\n  frob', ['FUD1065']],
    ['an empty `use` below', 'load\n  use', ['FUD1063']],
    ['an empty `skip` below', 'load\n  skip', ['FUD1063']],
    ['an empty `fails` below', 'load\n  fails', ['FUD1063']],
  ];
  for (const [what, source, expected] of broken) {
    it(`reports ${what}`, () => {
      expect(codes(source)).toEqual(expected);
    });
  }

  it('`ttl` and `page` report the word after them, or themselves at the end', () => {
    expect(slice('load ttl soon', parseApi('load ttl soon').diagnostics[0]!.span)).toBe('soon');
    expect(slice('load ttl', parseApi('load ttl').diagnostics[0]!.span)).toBe('ttl');
    expect(slice('load page', parseApi('load page').diagnostics[0]!.span)).toBe('page');
  });
});

describe('paths, layout and chain', () => {
  it('`paths` and `layout` are a word alone', () => {
    expect(first('paths', 'paths').kind).toBe('paths');
    expect(first('# Props.\nlayout', 'layout').doc).toBe('Props.');
    expect(codes('paths x')).toEqual(['FUD1064']);
    expect(codes('layout\n  x')).toEqual(['FUD1065']);
  });

  it('`chain` reads `use`, `skip` and one `compress`', () => {
    const chain = first('chain\n  use log\n  skip csrf\n  compress gzip\n  compress off', 'chain');
    expect([chain.uses.length, chain.skips.length, chain.compress!.encoding!.text]).toEqual([1, 1, 'gzip']);
    expect(codes('chain\n  compress gzip\n  compress off')).toEqual(['FUD1071']);
    expect(codes('chain x')).toEqual(['FUD1064']);
    expect(codes('chain\n  use\n  skip')).toEqual(['FUD1063', 'FUD1063']);
    expect(first('chain', 'chain')).not.toHaveProperty('compress');
  });
});

describe('type, enum and messages', () => {
  it('`type` drops a field it cannot read and keeps the rest', () => {
    const type = first('type A\n  x\n  y  str[\n  z  str', 'type');
    expect(type.fields.map((f) => f.name.text)).toEqual(['z']);
    expect(codes('type A\n  x\n  y  str[\n  z  str')).toEqual(['FUD1065', 'FUD1067']);
    expect(codes('type A B\n  x  str')).toEqual(['FUD1064']);
    expect(codes('type A\n  x  str i32')).toEqual(['FUD1064']);
    expect(codes('type A\n  x  str\n    y')).toEqual(['FUD1065']);
  });

  it('`enum` reads one member per line (SDD §3.2)', () => {
    const source = 'enum Variant          # a union of literals\n  default\n  highlight';
    expect(codes(source)).toEqual([]);
    expect(first(source, 'enum').members.map((m) => m.text)).toEqual(['default', 'highlight']);
    expect(codes('enum')).toEqual(['FUD1063']);
    expect(codes('enum E')).toEqual(['FUD1073']);
    expect(codes('enum E x\n  a')).toEqual(['FUD1064']);
    expect(codes('enum E\n  a b')).toEqual(['FUD1064']);
    expect(codes('enum E\n  a\n    b')).toEqual(['FUD1065']);
  });

  it('`messages` reads `<code> "<text>"` lines', () => {
    const source = 'messages\n  required  "Este campo es obligatorio."\n  min  "Mínimo {n}."';
    expect(codes(source)).toEqual([]);
    expect(first(source, 'messages').entries.map((e) => [e.code.text, e.text.text])).toEqual([
      ['required', 'Este campo es obligatorio.'],
      ['min', 'Mínimo {n}.'],
    ]);
    expect(codes('messages x')).toEqual(['FUD1064']);
    expect(codes('messages\n  required')).toEqual(['FUD1068']);
    expect(codes('messages\n  required  "a" "b"')).toEqual(['FUD1064']);
    expect(codes('messages\n  Required  "a"')).toEqual(['FUD1070']);
    expect(codes('messages\n  required  "a"\n    x')).toEqual(['FUD1065']);
    expect(first('messages\n  required', 'messages').entries).toEqual([]);
  });
});

describe('the role of a file', () => {
  it('a contract after extensions is FUD1078 and stays in the tree', () => {
    const source = 'type T\n  x  str\npattern p  a\nget f';
    expect(codes(source)).toEqual(['FUD1078']);
    expect(parseApi(source).value.role).toBe('extensions');
    expect(parseApi(source).value.declarations.map((d) => d.kind)).toEqual(['type', 'pattern', 'fn']);
  });

  it('a second `chain` is not in the tree', () => {
    expect(parseApi('chain\nchain\n  use log').value.declarations).toHaveLength(1);
  });
});
