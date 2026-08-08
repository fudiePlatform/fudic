/**
 * Scope analysis over the Oxc AST (SDD-30 §3.3).
 *
 * The property under test is one-sided and that asymmetry is the whole design: the list of
 * free references may pass of more — a name that is not a dependency costs an argument
 * nobody reads — and may never fall short, because a dependency left out is a block that
 * silently stops updating. So every case below asks one of two questions: is this position
 * a reference (it had better be reported), or is it a declaration, a property key or a
 * label (it had better not be).
 *
 * The ASTs are real: each fragment goes through `JsBatch` exactly as the emit sends it.
 */

import { describe, expect, it } from 'vitest';
import { JsBatch, type JsFragmentKind, type OxcNode } from '../../src/oxc/index.js';
import { span } from '../../src/types/index.js';
import {
  changeableBindings,
  freeReferences,
  patternBindings,
  type FragmentAst,
} from '../../src/emit/scope.js';

/** Parse one fragment the way the emit does, and hand back its AST. */
function parse(kind: JsFragmentKind, source: string): FragmentAst {
  const batch = new JsBatch(source);
  const id = batch.add(kind, span(0, source.length));
  const result = batch.parse();
  expect(result.diagnostics).toEqual([]);
  return result.value.ast(id);
}

const expr = (source: string): FragmentAst => parse('expression', source);
const statements = (source: string): readonly OxcNode[] =>
  parse('module-statements', source) as readonly OxcNode[];

/** The free references of one expression, which is the shape most fragments have. */
const free = (source: string): readonly string[] => freeReferences([expr(source)]);

describe('freeReferences — what counts as a reference', () => {
  it('reports a bare identifier', () => {
    expect(free('rows')).toEqual(['rows']);
  });

  it('reports the object of a member expression and NOT its property', () => {
    // `obj.a` names no `a`. Reporting it would put a parameter in the signature that
    // shadows the author's own name (§3.3).
    expect(free('row.label')).toEqual(['row']);
    expect(free('a.b.c.d')).toEqual(['a']);
  });

  it('reports a computed property, which IS a reference', () => {
    expect(free('rows[i]')).toEqual(['rows', 'i']);
  });

  it('reports the value of an object literal and not its key', () => {
    expect(free('({ id: row })')).toEqual(['row']);
  });

  it('reports a computed key of an object literal', () => {
    expect(free('({ [k]: 1 })')).toEqual(['k']);
  });

  it('deduplicates, keeping the FIRST appearance — the order a signature needs', () => {
    expect(free('a + b + a + c')).toEqual(['a', 'b', 'c']);
  });

  it('walks into calls, templates, ternaries and everything else it does not know', () => {
    expect(free('f(x) ? `${y}` : [z]')).toEqual(['f', 'x', 'y', 'z']);
  });

  it('takes a fragment list in the order it is handed', () => {
    expect(freeReferences([expr('b'), expr('a')])).toEqual(['b', 'a']);
  });

  it('says nothing about a fragment that has no AST at all', () => {
    expect(freeReferences([[]])).toEqual([]);
  });
});

describe('freeReferences — what a scope hides', () => {
  it('binds the parameters of an arrow, so they are not the outer names', () => {
    // The whole reason this is not a name collector: a handler that writes `(rows) => …`
    // declares its own `rows`, and the prop of that name is not what it reads.
    expect(free('(rows) => rows.length')).toEqual([]);
    expect(free('(a) => a + b')).toEqual(['b']);
  });

  it('binds a destructured parameter, and reads the default beside it', () => {
    expect(free('({ id, n = fallback }) => id + n')).toEqual(['fallback']);
  });

  it('binds an array pattern, holes and rest included', () => {
    expect(free('([, first, ...rest]) => first + rest.length + outer')).toEqual(['outer']);
  });

  it('binds a rest parameter', () => {
    expect(free('(...args) => args.length')).toEqual([]);
  });

  it('binds the name of a function expression inside itself', () => {
    expect(free('(function loop(n) { return loop(n - 1); })')).toEqual([]);
  });

  it('binds what a declaration declares, and reads its initialiser', () => {
    expect(freeReferences([parse('block-statements', 'const x = outer; x.y;')])).toEqual(['outer']);
  });

  it('binds a destructured declaration', () => {
    expect(freeReferences([parse('block-statements', 'const { a, b } = src; a + b;')])).toEqual([
      'src',
    ]);
  });

  it('binds what a for-of header declares, which is what a @foreach is', () => {
    expect(freeReferences([parse('for-of-header', 'const { id, name } of rows')])).toEqual(['rows']);
  });

  it('binds what a C-style for header declares', () => {
    expect(freeReferences([parse('for-header', 'let i = 0; i < n; i++')])).toEqual(['n']);
  });

  it('closes a block scope again on the way out', () => {
    const ast = parse('block-statements', '{ const inner = 1; inner; } inner;');
    expect(freeReferences([ast])).toEqual(['inner']);
  });
});

describe('freeReferences — a type is not a value', () => {
  it('reads the expression of an `as` and drops the type beside it', () => {
    expect(free('value as Tone')).toEqual(['value']);
  });

  it('drops the annotation of a typed parameter', () => {
    expect(free('(e: MouseEvent) => e.type')).toEqual([]);
  });

  it('reads through a non-null assertion', () => {
    expect(free('row!.id')).toEqual(['row']);
  });
});

describe('patternBindings — in the order the pattern writes them', () => {
  /** The `id` of the first declarator of a statement: what a loop header hands over. */
  function target(source: string): unknown {
    const [statement] = statements(source);
    const declarations = statement!['declarations'] as OxcNode[];
    return declarations[0]!['id'];
  }

  it('reads a plain identifier', () => {
    expect(patternBindings(target('const row = 1;'))).toEqual(['row']);
  });

  it('reads an object pattern in source order, not alphabetically', () => {
    expect(patternBindings(target('const { name, id } = row;'))).toEqual(['name', 'id']);
  });

  it('reads a nested pattern, its rest and its defaults', () => {
    expect(patternBindings(target('const { a: { b }, ...rest } = row;'))).toEqual(['b', 'rest']);
    expect(patternBindings(target('const { n = 1 } = row;'))).toEqual(['n']);
  });

  it('reads an array pattern, skipping its holes', () => {
    expect(patternBindings(target('const [, second, ...tail] = row;'))).toEqual(['second', 'tail']);
  });

  it('reads the value of a computed key, and the key itself is a reference', () => {
    expect(patternBindings(target('const { [k]: v } = row;'))).toEqual(['v']);
    expect(freeReferences([parse('block-statements', 'const { [k]: v } = row; v;')])).toEqual([
      'row',
      'k',
    ]);
  });

  it('declares nothing for something that is not a pattern', () => {
    expect(patternBindings(undefined)).toEqual([]);
    expect(patternBindings({ type: 'Literal', start: 0, end: 1 })).toEqual([]);
  });

  it('declares nothing for a pattern whose parts are simply not there', () => {
    // The AST is Oxc's and untyped on this side of the bridge. A shape with a field
    // missing has to come back empty, not throw: the emit does not stop (§5).
    expect(patternBindings({ type: 'ObjectPattern', start: 0, end: 0 })).toEqual([]);
    expect(patternBindings({ type: 'ArrayPattern', start: 0, end: 0 })).toEqual([]);
  });
});

describe('changeableBindings — what an update could bring again', () => {
  it('takes a let and a var, which the author can move', () => {
    expect([...changeableBindings(statements('let a = 1; var b = 2;'))]).toEqual(['a', 'b']);
  });

  it('leaves out a const nobody reassigns: a parameter for it would be noise', () => {
    expect([...changeableBindings(statements('const pick = (id) => id;'))]).toEqual([]);
  });

  it('takes a const that IS assigned somewhere — the AST decides, not the keyword', () => {
    // Not valid at runtime, but the rule is about what the code says, and a rule that
    // trusted `const` alone would be a rule about spelling.
    expect([...changeableBindings(statements('const a = 1; a = 2;'))]).toEqual(['a']);
  });

  it('takes a name that is only ever incremented', () => {
    expect([...changeableBindings(statements('const n = 0; n++;'))]).toEqual(['n']);
  });

  it('takes every name of a destructured let, in pattern order', () => {
    expect([...changeableBindings(statements('let { a, b } = src;'))]).toEqual(['a', 'b']);
  });

  it('ignores what is not a declaration at all', () => {
    expect([...changeableBindings(statements('function f() {} f();'))]).toEqual([]);
  });

  it('ignores an assignment that does not target a plain name', () => {
    expect([...changeableBindings(statements('let a = 1; obj.b = 2;'))]).toEqual(['a']);
  });
});
