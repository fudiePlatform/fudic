/**
 * SDD-60 criterion 28 — completion in a `.fudapi`: each row of the §4.9 table with a case.
 */

import { describe, expect, it } from 'vitest';
import { DECLARATION_KEYWORDS } from '@fudic/api';
import type { CompletionItem } from 'vscode-languageserver-protocol';
import { apiCompletions } from '../../src/fudapi/completion.js';
import { FILES, SRC, apiDocument, cursor, world } from './_api.js';

const PRIMITIVES = ['str', 'html', 'bool', 'date', 'uuid', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64'];
/** The primitives, then the project's types: a library's first (`@fudic/dev`, a devDependency), then the app's. */
const TYPES = [...PRIMITIVES, 'DevOnly', 'Person', 'Role'];

/** The items at the `|` of `marked`, in a project with `files` added. */
function items(marked: string, files: Readonly<Record<string, string>> = {}, path?: string): readonly CompletionItem[] | undefined {
  const { text, offset } = cursor(marked);
  const { host } = world({ files: { ...FILES, ...files } });
  return apiCompletions(apiDocument(host, text, path), offset)?.items;
}

const labels = (marked: string, files?: Readonly<Record<string, string>>, path?: string): readonly string[] | undefined =>
  items(marked, files, path)?.map((i) => i.label);

describe('completion (criterion 28)', () => {
  describe('at column 0', () => {
    it('the declarations', () => {
      expect(labels('|')).toEqual(DECLARATION_KEYWORDS);
      expect(labels('type A\n  x  str\nge|')).toEqual(DECLARATION_KEYWORDS);
    });

    it('after `load`: modes, `ttl`, policies and `page`; after `page`, its values', () => {
      expect(labels('load |')).toEqual([
        'ssg', 'ssr', 'sw', 'ttl', 'cache-first', 'network-first', 'stale-while-revalidate', 'network-only', 'page',
      ]);
      expect(labels('load ssr page |')).toEqual(['never', 'persist']);
    });

    it('after any other declaration word, nothing', () => {
      expect(labels('get |')).toBeUndefined();
    });
  });

  describe('the first word of an indented line', () => {
    it('what its parent takes', () => {
      expect(labels('get f\n  |')).toEqual(['use', 'skip', 'form', 'invalidates', 'compress', 'fails', 'query', '->']);
      expect(labels('load\n  |')).toEqual(['use', 'skip', 'fails']);
      expect(labels('chain\n  |')).toEqual(['use', 'skip', 'compress']);
      expect(labels('type A\n  |')).toEqual([]);
      expect(labels('form f\n  |')).toEqual(['validate-on', 'validity', 'catches', 'summary']);
      expect(labels('rule r\n  |')).toEqual(['on', 'runs', 'async', 'fails']);
      expect(labels('middleware m\n  |')).toEqual(['client', 'server', 'adds', 'fails']);
      expect(labels('middleware m\n  adds\n    |')).toEqual([]);
      expect(labels('form f\n  g  group\n    |')).toEqual(['validate-on', 'validity', 'summary']);
      expect(labels('form f\n  a  str\n  summary\n    when a\n      |')).toEqual(['require']);
    });

    it('under a field: its options and the rules that apply to its type, with their parameters', () => {
      const found = items('form f\n  a  str\n    |')!;
      expect(found.map((i) => i.label)).toEqual(['validate-on', 'validity', 'range', 'required', 'min-length', 'pattern']);
      expect(found.find((i) => i.label === 'min-length')!.detail).toBe('n u32');
      expect(labels('form f\n  a  bool\n    |')).toEqual(['validate-on', 'validity', 'range', 'required']);
    });

    it('under a field inside a group, too', () => {
      expect(labels('form f\n  g  group\n    a  str[]\n      |')).toEqual(['validate-on', 'validity', 'range', 'required', 'min-length']);
    });

    it('under a field after a group, looking through the group first', () => {
      expect(labels('form f\n  g  group\n    a  str\n  b  bool\n    |')).toEqual(['validate-on', 'validity', 'range', 'required']);
    });

    it('under a field whose line the tree has not got, only the options', () => {
      expect(labels('form f\n  a  str[\n    |')).toEqual(['validate-on', 'validity', 'range']);
      // A form with no name is no declaration at all.
      expect(labels('form\n  a  str\n    |')).toEqual(['validate-on', 'validity', 'range']);
    });

    it('in a summary: `require`, `when` and the rules of a form, or of a group inside one', () => {
      const group = { [`${SRC}/rules/g.fudapi`]: 'rule all-or-none\n  on group\n  runs both\n  fails x\nrule whole\n  on form\n  runs both\n  fails y' };
      expect(labels('form f\n  a  str\n  summary\n    |', group)).toEqual(['require', 'when', 'whole']);
      expect(labels('form f\n  g  group\n    a  str\n    summary\n      |', group)).toEqual(['require', 'when', 'all-or-none']);
    });

    it('under a `use`: the parameters of its middleware', () => {
      const found = items('get f\n  use csrf error-pages\n    |')!;
      expect(found.map((i) => [i.label, i.detail])).toEqual([['routes', 'map u16 str']]);
      expect(labels('get f\n  use nope\n    |')).toEqual([]);
    });

    it('a line under no declaration, or under a line that takes nothing, gets nothing to choose', () => {
      expect(labels('  |')).toEqual([]);
      expect(labels('paths\n  |')).toEqual([]);
      expect(labels('enum E\n  a\n    |')).toEqual([]);
      expect(labels('middleware m\n  client\n    |')).toEqual([]);
      expect(labels('type A\n  x  str\n    |')).toEqual([]);
    });
  });

  describe('after a keyword', () => {
    it('`use`: the middlewares, with what they add', () => {
      const found = items('get f\n  use |')!;
      expect(found.map((i) => i.label)).toEqual(['csrf', 'error-pages', 'auth']);
      expect(found.find((i) => i.label === 'auth')!.detail).toBe('user: str, roles: str[]');
      expect(found.find((i) => i.label === 'csrf')!.detail).toBeUndefined();
    });

    it('`skip`: only what the level inherits, and `*`', () => {
      const http = { [`${SRC}/http.fudapi`]: 'chain\n  use csrf' };
      expect(labels('chain\n  use auth\nget f\n  skip |', http)).toEqual(['csrf', 'auth', '*']);
      expect(labels('load\n  skip |', http)).toEqual(['csrf', '*']);
      // Out of any level nothing is inherited: only `*` is left to offer.
      expect(labels('form f\n  skip |')).toEqual(['*']);
    });

    it('`skip` before any level: only `*`', () => {
      expect(labels('  skip |')).toEqual(['*']);
    });

    it('`form` in a function: the forms; elsewhere, nothing', () => {
      const forms = { [`${SRC}/forms/person.fudapi`]: 'form person\n  name  str' };
      expect(labels('put f\n  form |', forms)).toEqual(['person']);
      expect(labels('chain\n  form |', forms)).toBeUndefined();
    });

    it('`on`: the targets; after `field`, the types with `*` and `*[]`', () => {
      expect(labels('rule r\n  on |')).toEqual(['field', 'group', 'form']);
      expect(labels('rule r\n  on field |')).toEqual([...TYPES, '*', '*[]']);
      expect(labels('rule r\n  on field str |')).toEqual([...TYPES, '*', '*[]']);
      expect(labels('rule r\n  on group |')).toBeUndefined();
    });

    it('`runs`, `validate-on`, `validity` and `compress`: their values', () => {
      expect(labels('rule r\n  runs |')).toEqual(['both', 'server']);
      expect(labels('form f\n  validate-on blur |')).toEqual(['submit', 'blur', 'input']);
      expect(labels('form f\n  validity |')).toEqual(['rules', 'interacted']);
      expect(labels('chain\n  compress |')).toEqual(['gzip', 'deflate', 'deflate-raw', 'off']);
      expect(labels('chain\n  compress gzip |')).toBeUndefined();
    });

    it('`query x` and `->`: the types; `query` alone, nothing', () => {
      expect(labels('get f\n  query q |')).toEqual(TYPES);
      expect(labels('get f\n  query |')).toBeUndefined();
      expect(labels('get f\n  -> |')).toEqual(TYPES);
    });

    it('enum types are told from classes', () => {
      const found = items('get f\n  -> |')!;
      expect(found.find((i) => i.label === 'Role')!.kind).not.toBe(found.find((i) => i.label === 'Person')!.kind);
    });
  });

  describe('after the name of a field, an argument or a parameter: the types', () => {
    it('in a function, a load, a type, adds', () => {
      expect(labels('get f\n  q |')).toEqual(TYPES);
      expect(labels('load\n  users |')).toEqual(TYPES);
      // The file's own types are in the project too.
      expect(labels('type A\n  x |')).toEqual([...TYPES, 'A']);
      expect(labels('middleware m\n  adds\n    user |')).toEqual(TYPES);
      expect(labels('middleware m\n  realm |')).toEqual(TYPES);
    });

    it('`group` too in a form or a group, `pattern` too in a rule', () => {
      expect(labels('form f\n  a |')).toEqual([...TYPES, 'group']);
      expect(labels('form f\n  g  group\n    a |')).toEqual([...TYPES, 'group']);
      expect(labels('rule r\n  regex |')).toEqual([...TYPES, 'pattern']);
    });

    it('not after a keyword of the context, nor past the type', () => {
      expect(labels('get f\n  invalidates |')).toBeUndefined();
      expect(labels('get f\n  q str |')).toBeUndefined();
      expect(labels('chain\n  x |')).toBeUndefined();
    });
  });

  describe('after the type of a field (SDD-70 §3.1)', () => {
    it('`later` in a field of `load`, plain or optional', () => {
      expect(labels('load\n  users Person[] |')).toEqual(['later']);
      expect(labels('load ssr\n  title  str\n  users  Person[]?  |')).toEqual(['later']);
    });

    it('nothing once `later` is there', () => {
      expect(labels('load\n  users Person[] later |')).toBeUndefined();
    });

    it('not in a type, a form, a function, a middleware, nor after a clause of `load`', () => {
      expect(labels('type A\n  x str |')).toBeUndefined();
      expect(labels('form f\n  a str |')).toBeUndefined();
      expect(labels('get f\n  q str |')).toBeUndefined();
      expect(labels('middleware m\n  adds\n    user str |')).toBeUndefined();
      expect(labels('load\n  use auth |')).not.toContain('later');
      expect(labels('load\n  skip auth |')).not.toContain('later');
      expect(labels('load\n  fails gone |')).toBeUndefined();
    });
  });

  describe('in `require` and `when`: the field paths of the scope and the operators', () => {
    const FORM = 'form f\n  name  str\n  acceso  group\n    clave  str\n    repetir  str\n';

    it('of the form', () => {
      const found = items(`${FORM}  summary\n    require x  |`)!;
      expect(found.map((i) => i.label)).toEqual([
        'name', 'acceso', 'acceso.clave', 'acceso.repetir', 'and', 'or', 'not', 'contains', 'valid', 'empty', 'length',
      ]);
      expect(found.find((i) => i.label === 'acceso')!.detail).toBe('group');
      expect(found.find((i) => i.label === 'name')!.detail).toBe('str');
      expect(labels(`${FORM}  summary\n    when |`)).toContain('acceso.clave');
    });

    it('of the group whose summary it is', () => {
      expect(labels(`${FORM}    summary\n      require x  clave == |`)).toEqual([
        'clave', 'repetir', 'and', 'or', 'not', 'contains', 'valid', 'empty', 'length',
      ]);
    });

    it('a group line the tree has not got scopes nothing', () => {
      // `9g` is no name: the line is reported and left out of the tree.
      expect(labels('form f\n  a  str\n  9g  group\n    b  str\n    summary\n      require x  |')).toEqual([
        'and', 'or', 'not', 'contains', 'valid', 'empty', 'length',
      ]);
    });

    it('nothing before the code of a `require`', () => {
      expect(labels(`${FORM}  summary\n    require |`)).toBeUndefined();
    });

    it('with no form above, only the operators', () => {
      expect(labels('  require x  |')).toEqual(['and', 'or', 'not', 'contains', 'valid', 'empty', 'length']);
    });

    it('of a group inside a group', () => {
      expect(labels('form f\n  a  str\n  g  group\n    h  group\n      b  str\n      summary\n        require x  |')).toEqual([
        'b', 'and', 'or', 'not', 'contains', 'valid', 'empty', 'length',
      ]);
    });
  });

  describe('after the name of a rule: its next parameter when the choice is closed', () => {
    it('a pattern parameter: the patterns', () => {
      expect(labels('form f\n  a  str\n    pattern |')).toEqual(['email']);
    });

    it('an enum parameter: its members', () => {
      const rule = { [`${SRC}/rules/role.fudapi`]: 'rule is-role\n  on field str\n  runs both\n  role  Role\n  fails x' };
      expect(labels('form f\n  a  str\n    is-role |', rule)).toEqual(['admin', 'user']);
      expect(labels('form f\n  a  str\n  summary\n    is-role |', rule)).toEqual(['admin', 'user']);
    });

    it('anything else: nothing', () => {
      expect(labels('form f\n  a  str\n    min-length |')).toBeUndefined();
      expect(labels('form f\n  a  str\n    required |')).toBeUndefined();
      expect(labels('form f\n  a  str\n    nope |')).toBeUndefined();
      const typed = { [`${SRC}/rules/t.fudapi`]: 'rule typed\n  on field str\n  runs both\n  p  Person\n  l  str[]\n  fails x' };
      expect(labels('form f\n  a  str\n    typed |', typed)).toBeUndefined();
      expect(labels('form f\n  a  str\n    typed x |', typed)).toBeUndefined();
    });
  });

  describe('inside a text, after `{`', () => {
    const RULES = {
      [`${SRC}/rules/r.fudapi`]: 'rule between\n  on field u8\n  runs server\n  lo  u8\n  hi  u8\n  fails between lo hi',
    };

    it('the parameters the rule of the line gives, and `{detail}` for a server rule', () => {
      expect(labels('form f\n  a  u8\n    between 1 2  "From {|', RULES)).toEqual(['lo', 'hi', 'detail']);
      expect(labels('form f\n  a  str\n    min-length 3  "At least {n|', RULES)).toEqual(['n']);
    });

    it('`{min}` and `{max}` in a `range`', () => {
      expect(labels('form f\n  a  u8\n    range "{|')).toEqual(['min', 'max']);
    });

    it('nothing in a text outside a field or a summary', () => {
      expect(labels('get f\n  fails x 409 "{|')).toEqual([]);
    });

    it('nothing for an unknown rule, a `require`, or a string with no `{` open', () => {
      expect(labels('form f\n  a  str\n    nope  "{|')).toEqual([]);
      expect(labels('form f\n  a  str\n  summary\n    require x  a  "{|')).toEqual([]);
      expect(labels('form f\n  a  str\n    required  "Write |')).toBeUndefined();
      expect(labels('form f\n  a  str\n    required  "\\"{|')).toEqual(['required'].slice(1));
    });

    it('a closed string puts the cursor back outside', () => {
      expect(labels('get f\n  fails x 409 "a" |')).toBeUndefined();
    });
  });

  it('nothing inside a comment', () => {
    expect(labels('# a |')).toBeUndefined();
    expect(labels('get f\n  use auth # |')).toBeUndefined();
  });

  it('reads the lines above through \\r\\n and \\r, blank lines and comments', () => {
    expect(labels('rule r\r\n\r\n  # note\r\n  |')).toEqual(['on', 'runs', 'async', 'fails']);
    expect(labels('rule r\r  |')).toEqual(['on', 'runs', 'async', 'fails']);
  });
});
