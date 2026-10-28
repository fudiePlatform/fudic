/**
 * SDD-67 §3.3, §3.4, §3.5 and §4.3–§4.4 — what the emitter writes for the format of a function:
 * its `wire` (binary unless `json` is left once its chain is folded), its `sig`, its `returns`
 * and the rules under its arguments; and that a module imports only what its functions use.
 * Criteria 8 (what changes the signature and what does not), 11 (the folding of `use json` and
 * `skip json`) and 13 (the pruning, as the imports of a module).
 */

import { describe, expect, it } from 'vitest';
import { signature } from '@fudic/http/wire';
import { createApiIndex, emitModule, type ApiSource, type FnDecl } from '../../src/index.js';
import { canonical, fnv1a } from '../../src/emit/signature.js';
import { app, BUILT_INS } from '../project.js';

const lines = (...l: string[]): string => l.join('\n');

/** The browser module of `routes/x` written as `text`, with the global chain `global`. */
function emitted(text: string, global?: string, others: readonly ApiSource[] = []): string {
  const source = app('routes/x', text);
  const extra = global === undefined ? [] : [app('http', global)];
  const index = createApiIndex([...BUILT_INS, ...extra, ...others, source]);
  return emitModule(source, index, {}, 'browser');
}

/** The object literal a function is emitted with. */
function specOf(module: string, name: string): string {
  const line = module.split('\n').find((l) => l.startsWith(`export const ${name} = stub(`));
  expect(line, name).toBeDefined();
  return line!;
}

/** The format a function speaks, read from its emitted spec. */
const wireOf = (module: string, name: string): string => /wire: (\w+)/u.exec(specOf(module, name))![1]!;

/** The import lines of a module. */
const importsOf = (module: string): string[] => module.split('\n').filter((l) => l.startsWith('import '));

describe('criterion 11: use json, folded over the three levels', () => {
  it('without json anywhere, every function is binary, with its sig', () => {
    const m = emitted(lines('get a', '', 'put b', '  x  bool'));
    expect(wireOf(m, 'a')).toBe('binWire');
    expect(wireOf(m, 'b')).toBe('binWire');
    expect(specOf(m, 'b')).toMatch(/sig: "[0-9a-f]{8}"/u);
  });

  it('use json on the function: that one in JSON, without sig', () => {
    const m = emitted(lines('get a', '', 'put b', '  use json', '  x  bool'));
    expect(wireOf(m, 'a')).toBe('binWire');
    expect(wireOf(m, 'b')).toBe('jsonWire');
    expect(specOf(m, 'b')).not.toContain('sig:');
  });

  it('use json in the global chain and skip json on one function: that one binary, the rest JSON', () => {
    const m = emitted(lines('get a', '', 'put b', '  skip json', '  x  bool'), lines('chain', '  use json'));
    expect(wireOf(m, 'a')).toBe('jsonWire');
    expect(wireOf(m, 'b')).toBe('binWire');
    expect(specOf(m, 'a')).not.toContain('sig:');
    expect(specOf(m, 'b')).toContain('sig:');
  });

  it('use json in the chain of the file; skip * empties it', () => {
    const m = emitted(lines('chain', '  use json', '', 'get a', '', 'get b', '  skip *'));
    expect(wireOf(m, 'a')).toBe('jsonWire');
    expect(wireOf(m, 'b')).toBe('binWire');
  });

  it('skip json in the file undoes the global; use json on the function adds it back', () => {
    const m = emitted(lines('chain', '  skip json', '', 'get a', '', 'get b', '  use json'), lines('chain', '  use json'));
    expect(wireOf(m, 'a')).toBe('binWire');
    expect(wireOf(m, 'b')).toBe('jsonWire');
  });

  it('json does no work at run time: it leaves nothing in the chain, only the format', () => {
    const m = emitted(lines('get a', '  use json'));
    expect(specOf(m, 'a')).toContain('wire: jsonWire, chain: [{ steps: [{ use: [] }] }]');
    expect(specOf(m, 'a').replaceAll('jsonWire', '')).not.toMatch(/\bjson\b/u);
  });
});

describe('criterion 13 at compile time: a module imports only the codecs and the validators it uses', () => {
  it('all binary: binWire and not jsonWire', () => {
    const imports = importsOf(emitted(lines('get a', '', 'get b')));
    expect(imports).toContain("import { binWire } from '@fudic/http/wire/bin';");
    expect(imports.join('\n')).not.toContain('jsonWire');
  });

  it('all JSON: jsonWire and not binWire', () => {
    const imports = importsOf(emitted(lines('get a', '', 'get b'), lines('chain', '  use json')));
    expect(imports).toContain("import { jsonWire } from '@fudic/http/wire/json';");
    expect(imports.join('\n')).not.toContain('binWire');
  });

  it('one of each: both', () => {
    const imports = importsOf(emitted(lines('get a', '', 'get b', '  use json')));
    expect(imports).toContain("import { binWire } from '@fudic/http/wire/bin';");
    expect(imports).toContain("import { jsonWire } from '@fudic/http/wire/json';");
  });

  it('no rules: no validator; with them, each by its own name', () => {
    expect(emitted(lines('put a', '  name  str'))).not.toMatch(/minLength|maxLength|\$required/u);
    const m = emitted(lines('put a', '  name  str', '    max-length 80'));
    expect(importsOf(m)).toContain("import { maxLength as $maxLength } from '@fudic/forms/contract';");
    expect(m).not.toContain('minLength');
  });

  it('formTypes only with a function that takes a form', () => {
    expect(emitted(lines('get a')).includes('@fudic/http/wire\'')).toBe(false);
    const m = emitted(lines('form f', '  n  u8', '', 'post a', '  form f'));
    expect(importsOf(m)).toContain("import { formTypes } from '@fudic/http/wire';");
    expect(specOf(m, 'a')).toContain('args: formTypes(f.$schema), form: f');
  });
});

describe('returns', () => {
  it('-> is written as the type it is read back by; without it, nothing (a 204)', () => {
    const m = emitted(lines('type Person', '  id  uuid', '', 'get a', '  -> Person[]', '', 'get b', '  -> date?', '', 'put c'));
    expect(specOf(m, 'a')).toContain('returns: { list: $Person }');
    expect(specOf(m, 'b')).toContain('returns: { opt: "date" }');
    expect(specOf(m, 'c')).not.toContain('returns:');
  });
});

describe('§3.5: the rules under the arguments', () => {
  it('route, query and body, in declaration order, each with its validator, its arguments and its text', () => {
    const m = emitted(
      lines(
        'put save /:id',
        '  id  uuid',
        '    required',
        '  name  str',
        '    max-length 80',
        '    pattern email  "Not an email."',
        '  age  u8',
        '    min 18  "Too young."',
        '    max 99',
        '  query q  str?',
        '    min-length 2',
      ),
    );
    const spec = specOf(m, 'save');
    const rules = /rules: (\{.*\}), chain:/u.exec(spec)![1]!;
    expect(rules).toBe(
      '{ id: [{ check: $required, name: "required", args: [] }], ' +
        'name: [{ check: $maxLength(80), name: "max-length", args: [80] }, { check: $pattern(email), name: "pattern", args: ["email"], text: "Not an email." }], ' +
        'age: [{ check: $min(18), name: "min", args: [18], text: "Too young." }, { check: $max(99), name: "max", args: [99] }], ' +
        'q: [{ check: $minLength(2), name: "min-length", args: [2] }] }',
    );
    // `pattern` names the project's pattern, the RegExp a form would take.
    expect(m).toMatch(/import \{ email \} from "fudic:@fudic\/forms\/patterns";/u);
  });

  it('a function without rules has no rules field; one argument without them is left out', () => {
    expect(specOf(emitted(lines('put a', '  x  str')), 'a')).not.toContain('rules:');
    const spec = specOf(emitted(lines('put a', '  x  str', '  y  str', '    required')), 'a');
    expect(spec).toContain('rules: { y: [{ check: $required, name: "required", args: [] }] }');
  });

  it('a rule does not change the type of its argument', () => {
    const plain = specOf(emitted(lines('put a', '  x  str')), 'a');
    const ruled = specOf(emitted(lines('put a', '  x  str', '    max-length 3')), 'a');
    expect(/args: \{[^}]*\}/u.exec(ruled)![0]).toBe(/args: \{[^}]*\}/u.exec(plain)![0]);
  });
});

/** The function `name` of `text`, as parsed and indexed. */
function decl(text: string, name = 'save'): { d: FnDecl; text: string; index: ReturnType<typeof createApiIndex> } {
  const source = app('routes/x', text);
  const index = createApiIndex([...BUILT_INS, source]);
  const d = source.file.declarations.find((x): x is FnDecl => x.kind === 'fn' && x.name.text === name)!;
  return { d, text, index };
}

const canonicalOf = (text: string, name = 'save'): string => {
  const { d, index } = decl(text, name);
  return canonical(d, index);
};

const sigOf = (text: string, name = 'save'): string => /sig: "([0-9a-f]{8})"/u.exec(specOf(emitted(text), name))![1]!;

describe('§4.3: the canonical text', () => {
  it('route, query, body and ->, each type as written', () => {
    const text = lines('put save /:id', '  id  i32', '  query notify  bool', '  active  bool', '  -> str[]');
    expect(canonicalOf(text)).toBe('route(id:i32)|query(notify:bool)|body(active:bool)|->str[]');
  });

  it('empty parts keep their parentheses; without ->, ->', () => {
    expect(canonicalOf(lines('get save'))).toBe('route()|query()|body()|->');
  });

  it('a type unfolded, an enum as <a|b|c>, optionals and maps as written', () => {
    const text = lines(
      'enum Color',
      '  red',
      '  green',
      '',
      'type Person',
      '  id  uuid',
      '  tint  Color?',
      '',
      'put save',
      '  who  Person',
      '  tags  map str u8',
      '  -> Color[]',
    );
    expect(canonicalOf(text)).toBe('route()|query()|body(who:{id:uuid,tint:<red|green>?},tags:map str u8)|-><red|green>[]');
  });

  it('a type that names itself: @Name the second time', () => {
    const text = lines('type Node', '  v  u8', '  next  Node?', '', 'get save', '  -> Node');
    expect(canonicalOf(text)).toBe('route()|query()|body()|->{v:u8,next:@Node?}');
  });

  it('a form: form{…}, each control as the type it travels as', () => {
    const text = lines(
      'form f',
      '  qty  u32',
      '  name  str',
      '  gift  bool',
      '  id  uuid',
      '  tags  str[]',
      '  at  date',
      '  line  group',
      '    price  u16',
      '',
      'post save',
      '  form f',
    );
    expect(canonicalOf(text)).toBe('route()|query()|body(form{qty:u32?,name:str,gift:bool,id:str,tags:str[]?,at:date?,line:{price:u16?}})|->');
  });
});

describe('criterion 8: the signature', () => {
  const BASE = lines('enum Color', '  red', '  green', '', 'put save /:id', '  id  i32', '  name  str', '  -> Color');

  it('is FNV-1a of the canonical text: the same as signature of @fudic/http/wire', () => {
    const c = canonicalOf(BASE);
    expect(fnv1a(c)).toBe(signature(c));
    expect(sigOf(BASE)).toBe(signature(c));
  });

  it('changes with an argument more, a type changed, or an enum reordered', () => {
    const base = sigOf(BASE);
    expect(sigOf(BASE.replace('  name  str', '  name  str\n  age  u8'))).not.toBe(base);
    expect(sigOf(BASE.replace('  name  str', '  name  u8'))).not.toBe(base);
    expect(sigOf(BASE.replace('  red\n  green', '  green\n  red'))).not.toBe(base);
  });

  it('does not change with a rule, a comment or a middleware', () => {
    const base = sigOf(BASE);
    expect(sigOf(BASE.replace('  name  str', '  name  str\n    max-length 80  "Too long."'))).toBe(base);
    expect(sigOf(BASE.replace('put save /:id', '# Saves it.\nput save /:id'))).toBe(base);
    expect(sigOf(BASE.replace('put save /:id', 'put save /:id\n  use log'))).toBe(base);
  });

  it('two functions with the same types have the same signature, whatever their names', () => {
    const m = emitted(lines('put a', '  x  bool', '', 'put b', '  x  bool'));
    expect(/sig: "(\w+)"/u.exec(specOf(m, 'a'))![1]).toBe(/sig: "(\w+)"/u.exec(specOf(m, 'b'))![1]);
  });
});

describe('what the validator rejects, the emitter still writes without throwing', () => {
  it('a rule that is not one of the six, or not a rule, is left out; a pattern that does not resolve is undefined', () => {
    const taken = app('rules/taken', 'rule email-taken\n  on field str\n  runs server\n  fails taken');
    const m = emitted(lines('put a', '  x  str', '    email-taken', '    requird', '  y  str', '    pattern nope', '    max-length 3'), undefined, [taken]);
    expect(specOf(m, 'a')).toContain(
      'rules: { y: [{ check: $pattern(undefined), name: "pattern", args: ["nope"] }, { check: $maxLength(3), name: "max-length", args: [3] }] }',
    );
    expect(m).not.toContain('email-taken');
  });
});

describe('§4.3: a form control as the type it travels as, past the plain ones', () => {
  it('an optional control and a list of lists', () => {
    const text = lines('form f', '  n  u8?', '  b  bool?', '  grid  str[][]', '', 'post save', '  form f');
    expect(canonicalOf(text)).toBe('route()|query()|body(form{n:u8?,b:bool,grid:str[]?})|->');
  });
});
