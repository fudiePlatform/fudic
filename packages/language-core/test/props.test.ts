import { describe, expect, it } from 'vitest';
import { span, type OxcNode, type Span } from '@fudic/compiler';
import { emitPropsProjection, findPropsCall } from '../src/props.js';
import { VirtualWriter } from '../src/writer.js';
import { partitionCode } from '../src/code.js';
import { codeOf, parseFud, statementsOf } from './_support.js';

/** The first neutral chunk of a `.fud`'s `@code`, parsed as statements. */
function neutralOf(source: string): ReturnType<typeof statementsOf> {
  const chunk = partitionCode(codeOf(parseFud(source))).neutral[0]!;
  return statementsOf(source, chunk);
}

const wrap = (code: string): string =>
  `@code {\n${code}\n}\n\n<app-badge><template shadowrootmode="open"><i></i></template></app-badge>\n`;

const BADGE = wrap(`  type Tone = 'neutral' | 'success';
  const { tone = 'neutral' } = props<{ tone?: Tone }>();`);

/** A minimal Oxc-shaped node, for the defensive branches a real parse cannot produce. */
const node = (type: string, extra: Record<string, unknown> = {}): OxcNode =>
  ({ type, start: 0, end: 0, ...extra }) as OxcNode;

const identity = (s: number, e: number): Span => span(s, e);

describe('findPropsCall', () => {
  it('finds the declaration and returns its three spans in source coordinates', () => {
    const { statements, mapSpan } = neutralOf(BADGE);
    const found = findPropsCall(statements, mapSpan)!;

    expect(BADGE.slice(found.declaration.start, found.declaration.end)).toBe(
      "const { tone = 'neutral' } = props<{ tone?: Tone }>();",
    );
    expect(BADGE.slice(found.pattern.start, found.pattern.end)).toBe("{ tone = 'neutral' }");
    expect(BADGE.slice(found.call.start, found.call.end)).toBe('props<{ tone?: Tone }>()');
  });

  it('accepts a plain identifier binding', () => {
    const source = wrap('  const p = props<{ a: string }>();');
    const { statements, mapSpan } = neutralOf(source);
    const found = findPropsCall(statements, mapSpan)!;

    expect(source.slice(found.pattern.start, found.pattern.end)).toBe('p');
  });

  it('returns undefined when the component declares no props', () => {
    const { statements, mapSpan } = neutralOf(wrap('  const answer = 42;'));

    expect(findPropsCall(statements, mapSpan)).toBeUndefined();
  });

  it('ignores a props() call nested inside a function: that is not the contract', () => {
    const source = wrap('  function f() {\n    const inner = props<{ a: string }>();\n    return inner;\n  }');
    const { statements, mapSpan } = neutralOf(source);

    expect(findPropsCall(statements, mapSpan)).toBeUndefined();
  });

  it('ignores a declaration with no initializer', () => {
    const { statements, mapSpan } = neutralOf(wrap('  let pending;\n  pending = 1;'));

    expect(findPropsCall(statements, mapSpan)).toBeUndefined();
  });

  it('ignores a call of something else', () => {
    const { statements, mapSpan } = neutralOf(wrap('  const now = Date.now();'));

    expect(findPropsCall(statements, mapSpan)).toBeUndefined();
  });

  it('survives malformed nodes: no declarations, no id, non-node fields', () => {
    const call = node('CallExpression', { callee: node('Identifier', { name: 'props' }) });

    expect(findPropsCall([node('VariableDeclaration')], identity)).toBeUndefined();
    expect(
      findPropsCall([node('VariableDeclaration', { declarations: 'nope' })], identity),
    ).toBeUndefined();
    expect(
      findPropsCall(
        [node('VariableDeclaration', { declarations: [node('VariableDeclarator', { init: call })] })],
        identity,
      ),
    ).toBeUndefined();
    expect(
      findPropsCall(
        [
          node('VariableDeclaration', {
            declarations: [null, node('VariableDeclarator', { id: node('Identifier'), init: 7 })],
          }),
        ],
        identity,
      ),
    ).toBeUndefined();
  });
});

describe('emitPropsProjection', () => {
  it('splits the declaration into contract and binding, both copied verbatim', () => {
    const { statements, mapSpan } = neutralOf(BADGE);
    const w = new VirtualWriter(BADGE);
    emitPropsProjection(w, findPropsCall(statements, mapSpan));

    expect(w.build('x.fud.ts', 'typescript').text).toBe(
      'const $p0 = props<{ tone?: Tone }>();\n' +
        'export type $Props = typeof $p0;\n' +
        "const { tone = 'neutral' } = $p0;\n",
    );
  });

  it('maps the call and the pattern back to the user text, and nothing else', () => {
    const { statements, mapSpan } = neutralOf(BADGE);
    const w = new VirtualWriter(BADGE);
    emitPropsProjection(w, findPropsCall(statements, mapSpan));
    const file = w.build('x.fud.ts', 'typescript');

    const user = file.mappings.filter((m) => m.caps.navigation);
    expect(user.map((m) => BADGE.slice(m.sourceOffset, m.sourceOffset + m.length))).toEqual([
      'props<{ tone?: Tone }>()',
      "{ tone = 'neutral' }",
    ]);
    expect(file.mappings.filter((m) => !m.caps.navigation)).toHaveLength(1);
  });

  it('declares $Props as never when there is no props<T>()', () => {
    const w = new VirtualWriter('');
    emitPropsProjection(w, undefined);

    const file = w.build('x.fud.ts', 'typescript');
    expect(file.text).toBe('export type $Props = never;\n');
    expect(file.mappings).toEqual([]);
  });
});
