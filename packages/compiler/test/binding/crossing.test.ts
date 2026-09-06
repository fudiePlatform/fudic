/**
 * `crossing` and `reactiveNames` (BUG-23 task 26): the rule of decision 84, extracted from
 * `emit/attrs.ts` so the projection decides it with the very same function. The editor was
 * type-checking the signal OBJECT while the build crossed its VALUE (§2.8), and one
 * definition is the whole fix.
 */

import { describe, expect, it } from 'vitest';
import { crossing, reactiveNames, type ComponentDeclaredProps } from '../../src/binding/index.js';
import { JsBatch, type OxcNode } from '../../src/oxc/index.js';
import { parseDocument, type AttributeValuePart, type ElementNode } from '../../src/html/index.js';
import { span } from '../../src/types/index.js';

/** The top-level statements of a `@client`-shaped region, as Oxc returns them. */
function statements(source: string): readonly OxcNode[] {
  const batch = new JsBatch(source);
  const id = batch.add('module-statements', span(0, source.length));
  const ast = batch.parse().value.ast(id);
  return Array.isArray(ast) ? (ast as OxcNode[]) : [ast as OxcNode];
}

/** The value parts of the single attribute of a one-element snippet. */
function valueOf(markup: string): readonly AttributeValuePart[] {
  const document = parseDocument(markup).value;
  const element = document.children.find((c) => c.type === 'element') as ElementNode;
  return element.attributes[0]!.value;
}

describe('reactiveNames', () => {
  it('finds what `signal` and `computed` declare, and nothing else', () => {
    const names = reactiveNames(
      statements(
        [
          "import { signal } from '@fudic/core';",
          "const titulo = signal('Hola');",
          'const doble = computed(() => 2);',
          'const items = [{ id: 1 }];',
          'const cargado = cargar(1);',
          'function onClick(ev) {}',
          'let n = 0;',
        ].join('\n'),
      ),
    );

    expect([...names].sort()).toEqual(['doble', 'titulo']);
  });

  it('reads the CALLEE, not the import: a `signal` declared here counts the same', () => {
    const names = reactiveNames(
      statements(['function signal(v) { return v; }', 'const x = signal(1);'].join('\n')),
    );

    expect([...names]).toEqual(['x']);
  });

  it('says nothing about a destructured or computed callee', () => {
    const names = reactiveNames(
      statements(['const { a } = signal(1);', 'const b = core.signal(1);'].join('\n')),
    );

    expect([...names]).toEqual([]);
  });

  it('is empty for a region that declares nothing', () => {
    expect([...reactiveNames(statements('export const x = 1;'))]).toEqual([]);
  });
});

describe('crossing — the value form, which is the only one emitted', () => {
  const reactives = new Set(['titulo']);
  const cross = (markup: string): ReturnType<typeof crossing> =>
    crossing(markup, valueOf(markup), reactives);

  it('answers with the reactive a bare name crosses with', () => {
    expect(cross('<app-x .name="@titulo"></app-x>')).toEqual({ kind: 'value', name: 'titulo' });
  });

  it('answers the same with no quotes (decision 103)', () => {
    expect(cross('<app-x .name=@titulo></app-x>')).toEqual({ kind: 'value', name: 'titulo' });
  });

  it('says nothing about a value that merely READS one', () => {
    expect(cross('<app-x .name="@(titulo() + 1)"></app-x>')).toBeUndefined();
  });

  it('says nothing about a name that is not reactive', () => {
    expect(cross('<app-x .name="@otro"></app-x>')).toBeUndefined();
  });

  it('says nothing about a literal, a mixed value or an empty one', () => {
    expect(cross('<app-x .name="info"></app-x>')).toBeUndefined();
    expect(cross('<app-x .name="a @titulo"></app-x>')).toBeUndefined();
    expect(cross('<app-x .name></app-x>')).toBeUndefined();
  });
});

describe('crossing — what the CHILD declares', () => {
  const reactives = new Set(['titulo']);
  const markup = '<app-x .name="@titulo"></app-x>';
  const declared = (channel?: 'signal' | 'fn'): ComponentDeclaredProps => ({
    name: 'name',
    required: true,
    ...(channel === undefined ? {} : { channel }),
  });

  it('stays the value form when the prop asks for no channel', () => {
    expect(crossing(markup, valueOf(markup), reactives, declared())).toEqual({
      kind: 'value',
      name: 'titulo',
    });
  });

  it('is the shared cell when the prop declares Signal<T> (props-spec decision 86)', () => {
    expect(crossing(markup, valueOf(markup), reactives, declared('signal'))).toEqual({
      kind: 'ref',
      name: 'titulo',
    });
  });

  it('crosses a FUNCTION by reference too, and it is not in `reactives`', () => {
    const fn = '<app-x .name="@guardar"></app-x>';
    expect(crossing(fn, valueOf(fn), reactives, declared('fn'))).toEqual({
      kind: 'ref',
      name: 'guardar',
    });
  });

  it('never by reference when the value is not a bare name: FUD0200 says so, not this', () => {
    const compound = '<app-x .name="@(titulo() + 1)"></app-x>';
    expect(crossing(compound, valueOf(compound), reactives, declared('signal'))).toBeUndefined();
  });
});
