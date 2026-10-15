import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import {
  I18N_MODULE,
  child,
  children,
  eachNode,
  i18nImports,
  isNode,
  stringLiteral,
  unwrap,
} from '../../src/i18n/ast.js';
import type { OxcNode } from '../../src/oxc/index.js';

function program(code: string): readonly OxcNode[] {
  return parseSync('x.ts', code, { sourceType: 'module', lang: 'ts' }).program.body as unknown as readonly OxcNode[];
}

/** The expression of a single expression statement. */
function expr(code: string): OxcNode {
  return child(program(code)[0]!, 'expression')!;
}

describe('typed access', () => {
  it('isNode: an object with a string type', () => {
    expect(isNode({ type: 'Identifier' })).toBe(true);
    expect(isNode({ type: 1 })).toBe(false);
    expect(isNode(null)).toBe(false);
    expect(isNode('Identifier')).toBe(false);
    expect(isNode(undefined)).toBe(false);
  });

  it('child: a node field, or undefined', () => {
    const call = expr('f(a)');
    expect(child(call, 'callee')?.type).toBe('Identifier');
    expect(child(call, 'arguments')).toBeUndefined();
    expect(child(call, 'nope')).toBeUndefined();
  });

  it('children: a list field with its holes dropped, or empty', () => {
    const array = expr('[a, , b]');
    expect(children(array, 'elements').map((n) => n['name'])).toEqual(['a', 'b']);
    expect(children(array, 'type')).toEqual([]);
  });

  it('stringLiteral: only a string Literal', () => {
    expect(stringLiteral(expr('"x"'))).toBe('x');
    expect(stringLiteral(expr('42'))).toBeUndefined();
    expect(stringLiteral(expr('`x`'))).toBeUndefined();
    expect(stringLiteral(expr('x'))).toBeUndefined();
  });
});

describe('unwrap: the wrappers that do not change a value', () => {
  it.each([
    ['parentheses', '((x))'],
    ['as', '(x as string)'],
    ['satisfies', '(x satisfies string)'],
    ['a non-null assertion', 'x!'],
    ['a type assertion', '(<string>x)'],
    ['all of them nested', '((<any>(x!)) as string satisfies string)'],
  ])('%s', (_case, code) => {
    const node = unwrap(expr(code));
    expect(node.type).toBe('Identifier');
    expect(node['name']).toBe('x');
  });

  it('an optional chain is seen through to its member', () => {
    expect(unwrap(expr('a?.b')).type).toBe('MemberExpression');
  });

  it('anything else is itself', () => {
    const call = expr('f()');
    expect(unwrap(call)).toBe(call);
  });

  it('a wrapper without an expression is itself', () => {
    const odd: OxcNode = { type: 'ParenthesizedExpression', start: 0, end: 0 } as unknown as OxcNode;
    expect(unwrap(odd)).toBe(odd);
  });
});

describe('i18nImports', () => {
  it('maps the local name of t, format and locale', () => {
    const names = i18nImports(program(`import { t, format, locale } from '${I18N_MODULE}';`));
    expect([...names]).toEqual([
      ['t', 't'],
      ['format', 'format'],
      ['locale', 'locale'],
    ]);
  });

  it('follows a rename, and an imported name written as a string', () => {
    const names = i18nImports(program(`import { t as tr, "format" as fmt } from '@fudic/i18n';`));
    expect([...names]).toEqual([
      ['tr', 't'],
      ['fmt', 'format'],
    ]);
  });

  it('ignores the other names, namespace and default imports, and other modules', () => {
    const names = i18nImports(
      program(`
        import i18n, * as all from '@fudic/i18n';
        import { currency, date } from '@fudic/i18n';
        import { t } from 'i18next';
        import type { Pipe } from '@fudic/i18n';
        export const x = 1;
      `),
    );
    expect([...names]).toEqual([]);
  });

  it('reads every import statement', () => {
    const names = i18nImports(program(`import { t } from '@fudic/i18n';\nimport { locale as l } from '@fudic/i18n';`));
    expect([...names]).toEqual([
      ['t', 't'],
      ['l', 'locale'],
    ]);
  });
});

describe('eachNode', () => {
  it('visits every node, parents first, in source order, through arrays', () => {
    const seen: string[] = [];
    eachNode(program('a(b, [c]);'), (n) => {
      if (n.type === 'Identifier') seen.push(String(n['name']));
    });
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('ignores what is not a node, and never follows `parent`', () => {
    const leaf = { type: 'Identifier', name: 'x', start: 0, end: 1 };
    const root = { type: 'Wrapper', parent: { type: 'Outer' }, value: leaf, label: 'x', n: 3, nil: null };
    const seen: string[] = [];
    eachNode(root, (n) => seen.push(n.type));
    eachNode('not a node', (n) => seen.push(n.type));
    expect(seen).toEqual(['Wrapper', 'Identifier']);
  });
});
