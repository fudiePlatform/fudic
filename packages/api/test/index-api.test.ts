import { describe, expect, it } from 'vitest';
import { closest, createApiIndex, GLOBAL_ID, parseApi, typeText, type Decl, type TypeExpr } from '../src/index.js';
import { BUILT_INS, app, lib } from './project.js';

/** The type of the first field of `type T`. */
const typeOf = (text: string): TypeExpr =>
  (parseApi(`type T\n  x  ${text}`).value.declarations[0] as Extract<Decl, { kind: 'type' }>).fields[0]!.type;

describe('the project index (criterion 9)', () => {
  const person = app('types/person', 'type Person\n  name  str');
  const index = createApiIndex([person, ...BUILT_INS]);

  it('resolves a name of the app and one of a library, with no imports', () => {
    expect(index.lookup('type', 'Person')!.source).toBe(person);
    const required = index.lookup('rule', 'required')!;
    expect(required.decl.name.text).toBe('required');
    expect(required.source.origin).toEqual({ package: '@fudic/forms' });
    expect(index.lookup('middleware', 'csrf')!.source.id).toBe('@fudic/http/middlewares');
    expect(index.lookup('pattern', 'email')!.decl.kind).toBe('pattern');
  });

  it('a name it does not have resolves to nothing', () => {
    expect(index.lookup('type', 'Nobody')).toBeUndefined();
    expect(index.named('form', 'nobody')).toEqual([]);
  });

  it('puts the libraries first and the app after, whatever the order given', () => {
    expect(index.sources.map((s) => s.origin === 'app')).toEqual([false, false, false, true]);
  });

  it('keeps every namespace apart: a type, a form, a rule, a middleware and a pattern may share a name', () => {
    const shared = app(
      'shared',
      ['type Same', '  x  str', 'form Same', '  x  str'].join('\n'),
    );
    const ext = app('ext', ['rule same', 'middleware same', '  client', 'pattern same  x'].join('\n'));
    const i = createApiIndex([shared, ext]);
    expect(i.lookup('type', 'Same')!.decl.kind).toBe('type');
    expect(i.lookup('form', 'Same')!.decl.kind).toBe('form');
    expect(i.lookup('rule', 'same')!.decl.kind).toBe('rule');
    expect(i.lookup('middleware', 'same')!.decl.kind).toBe('middleware');
    expect(i.lookup('pattern', 'same')!.decl.kind).toBe('pattern');
  });

  it('a type and an enum share one namespace', () => {
    const i = createApiIndex([app('a', 'type V\n  x  str'), app('b', 'enum V\n  a')]);
    expect(i.named('type', 'V').map((d) => d.decl.kind)).toEqual(['type', 'enum']);
    expect(i.all('type')).toHaveLength(2);
  });

  it('the first declaration of a repeated name is the one that counts', () => {
    const mine = app('mine', 'rule required\n  on field str\n  runs both\n  fails required');
    const i = createApiIndex([mine, ...BUILT_INS]);
    expect(i.lookup('rule', 'required')!.source.origin).not.toBe('app');
    expect(i.named('rule', 'required').map((d) => d.source.origin === 'app')).toEqual([false, true]);
  });

  it('lists the `messages` of the project in order', () => {
    const i = createApiIndex([app('a', 'messages\n  x  "A."'), lib('p', 'm', 'messages\n  x  "B."')]);
    expect(i.messages().map((m) => m.source.id)).toEqual(['p/m', 'a']);
    expect(createApiIndex([]).messages()).toEqual([]);
  });

  it('an empty project has nothing of any class', () => {
    const empty = createApiIndex([]);
    expect(empty.all('rule')).toEqual([]);
    expect(empty.candidates('rule', 'requird')).toEqual([]);
    expect(empty.rulesFor(typeOf('str'))).toEqual([]);
  });
});

describe('candidates (criterion 10)', () => {
  const index = createApiIndex(BUILT_INS);

  it('`requird` is a typo of `required`', () => {
    expect(index.candidates('rule', 'requird')).toEqual(['required']);
  });

  it('a name far from all gives none', () => {
    expect(index.candidates('rule', 'zzzzzzz')).toEqual([]);
  });

  it('closest: at most two edits and a third of the name, nearest first, ties alphabetical', () => {
    expect(closest('mx', ['max', 'min'])).toEqual([]);
    // `maxim` is two edits away, more than a third of a four-letter name.
    expect(closest('maxx', ['max', 'min', 'maxim'])).toEqual(['max']);
    expect(closest('maximum', ['maxim', 'minimum'])).toEqual(['maxim', 'minimum']);
    expect(closest('lenght', ['length', 'height', 'len'])).toEqual(['height', 'length']);
    expect(closest('abcdefgh', ['abcdefgh', 'abcdefgh', 'abcdexxx'])).toEqual(['abcdefgh']);
  });
});

describe('the rules for a field type', () => {
  const rules = (index: ReturnType<typeof createApiIndex>, type: string): readonly string[] =>
    index.rulesFor(typeOf(type)).map((r) => r.decl.name.text);

  it('takes the types listed in `on field`, through `?`', () => {
    const index = createApiIndex(BUILT_INS);
    expect(rules(index, 'u8')).toEqual(['required', 'min', 'max']);
    expect(rules(index, 'str?')).toEqual(['required', 'min-length', 'max-length', 'pattern']);
    expect(rules(index, 'str[]')).toEqual(['required', 'min-length', 'max-length']);
    expect(rules(index, 'bool')).toEqual(['required']);
  });

  it('`*` takes any type and `*[]` any list; a rule without `on` takes none', () => {
    const index = createApiIndex([
      app('r', ['rule any', '  on field *', 'rule lists', '  on field *[]', 'rule nowhere', 'rule grouped', '  on group'].join('\n')),
    ]);
    expect(rules(index, 'Person')).toEqual(['any']);
    expect(rules(index, 'i32[]')).toEqual(['any', 'lists']);
    expect(rules(index, 'map str i32')).toEqual(['any']);
  });
});

describe('inherited middlewares', () => {
  const http = app(GLOBAL_ID, 'chain\n  use log csrf');
  const fnOf = (source: ReturnType<typeof app>, kind: Decl['kind']): Decl =>
    source.file.declarations.find((d) => d.kind === kind)!;

  it('a function inherits the global chain and its file chain', () => {
    const file = app('routes/a', 'chain\n  use auth\nget f\nload');
    const index = createApiIndex([http, file]);
    expect(index.inherited(file, fnOf(file, 'fn') as never)).toEqual(['log', 'csrf', 'auth']);
    expect(index.inherited(file, fnOf(file, 'load') as never)).toEqual(['log', 'csrf', 'auth']);
  });

  it('a file chain inherits only the global one, and the global one nothing', () => {
    const file = app('routes/a', 'chain\n  use auth');
    const index = createApiIndex([http, file]);
    expect(index.inherited(file, fnOf(file, 'chain') as never)).toEqual(['log', 'csrf']);
    expect(index.inherited(http, fnOf(http, 'chain') as never)).toEqual([]);
  });

  it('a function of the global file inherits only its chain', () => {
    const global = app(GLOBAL_ID, 'chain\n  use log\nget ping');
    const index = createApiIndex([global]);
    expect(index.inherited(global, fnOf(global, 'fn') as never)).toEqual(['log']);
  });

  it('what the file chain skips is not inherited; `skip *` drops all the global', () => {
    const skipOne = app('routes/a', 'chain\n  skip csrf\nget f');
    const skipAll = app('routes/b', 'chain\n  skip *\n  use auth\nget f');
    const index = createApiIndex([http, skipOne, skipAll]);
    expect(index.inherited(skipOne, fnOf(skipOne, 'fn') as never)).toEqual(['log']);
    expect(index.inherited(skipAll, fnOf(skipAll, 'fn') as never)).toEqual(['auth']);
  });

  it('with no global file and no chain, nothing', () => {
    const file = app('routes/a', 'get f');
    expect(createApiIndex([file]).inherited(file, fnOf(file, 'fn') as never)).toEqual([]);
  });

  it('a library file called `http` is not the global chain', () => {
    const fake = lib('p', GLOBAL_ID, 'chain\n  use log');
    const file = app('routes/a', 'get f');
    expect(createApiIndex([fake, file]).inherited(file, fnOf(file, 'fn') as never)).toEqual([]);
  });
});

describe('typeText', () => {
  it('writes a type as it is written', () => {
    for (const t of ['str', 'Person[]', 'i32?', 'str[]?', 'map str map u8 bool[]']) expect(typeText(typeOf(t))).toBe(t);
  });
});
