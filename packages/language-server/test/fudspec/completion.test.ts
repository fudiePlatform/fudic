/**
 * SDD-52 criterion 22 — completion in a `.fudspec`, by indentation.
 */

import { describe, expect, it } from 'vitest';
import type { CompletionList } from 'vscode-languageserver-protocol';
import { specCompletions } from '../../src/fudspec/completion.js';
import { cursor, specDocument, world } from './_spec.js';

const HEAD = 'component fud-card\ncriterion a\n';

/** The labels offered at `|`, or undefined when nothing is. */
function labels(marked: string, w = world()): readonly string[] | undefined {
  return offered(marked, w)?.items.map((i) => i.label);
}

function offered(marked: string, w = world()): CompletionList | undefined {
  const { text, offset } = cursor(marked);
  return specCompletions(specDocument(text), offset, w.host);
}

describe('keywords by indentation', () => {
  it('offers component and criterion at column 0', () => {
    expect(labels('|')).toEqual(['component', 'criterion']);
    expect(labels(`${HEAD}crit|`)).toEqual(['component', 'criterion']);
  });

  it('offers the blocks at two spaces', () => {
    expect(labels(`${HEAD}  |`)).toEqual(['given', 'when', 'then']);
    expect(labels(`${HEAD}  th|`)).toEqual(['given', 'when', 'then']);
  });

  it('offers nothing inside a comment', () => {
    expect(labels('# |')).toBeUndefined();
    expect(labels(`${HEAD}  then\n    min-height x # a|`)).toBeUndefined();
  });
});

describe('terms of the block', () => {
  it('offers the block’s terms of both layers, once, with the layer in sight', () => {
    const list = offered(`${HEAD}  then\n    |`);
    expect(list?.items).toEqual([
      {
        label: 'min-height',
        kind: 3,
        labelDetails: { description: 'workspace' },
        detail: 'min-height target:element px:number',
        documentation: '({ target, px }) => `${target} ${px}px`',
      },
      { label: 'visible', kind: 3, labelDetails: { description: 'framework' }, detail: 'visible target:element' },
    ]);
  });

  it('adds props in given, and only there', () => {
    expect(labels(`${HEAD}  given\n    ro|`)).toEqual(['route', 'props']);
    expect(labels(`${HEAD}  when\n    |`)).toEqual([]);
  });

  it('finds the block above comments and other lines, \\r\\n included', () => {
    expect(labels(`${HEAD}  then\n    visible x\n# note\n    |`)).toEqual(['min-height', 'visible']);
    expect(labels(`${HEAD.replaceAll('\n', '\r\n')}  then\r\n    |`)).toEqual(['min-height', 'visible']);
  });

  it('offers nothing without a block above', () => {
    expect(labels(`${HEAD}    |`)).toBeUndefined();
    expect(labels('    |')).toBeUndefined();
  });
});

describe('arguments', () => {
  const THEN = `${HEAD}  then\n`;

  it('offers component tags and role: for an element parameter', () => {
    const list = offered(`${THEN}    min-height |`);
    expect(list?.items.map((i) => [i.label, i.detail])).toEqual([
      ['fud-button', 'target'],
      ['fud-card', 'target'],
      ['role:', 'role:<role>/"<name>"'],
    ]);
    expect(labels(`${THEN}    min-height fud-c|`)).toEqual(['fud-button', 'fud-card', 'role:']);
    expect(labels(`${THEN}    minHeight |`)).toEqual(['fud-button', 'fud-card', 'role:']);
  });

  it('offers nothing for a parameter that is not an element', () => {
    expect(labels(`${THEN}    min-height fud-card |`)).toBeUndefined();
    expect(labels(`${THEN}    min-height fud-card 4|`)).toBeUndefined();
    expect(labels(`${THEN}    min-height "a b" |`)).toBeUndefined();
  });

  it('offers nothing past the parameters, for an unknown term, or off the four spaces', () => {
    expect(labels(`${THEN}    min-height a 1 |`)).toBeUndefined();
    expect(labels(`${THEN}    nope |`)).toBeUndefined();
    expect(labels(`${THEN}   min-height |`)).toBeUndefined();
  });

  it('offers the fixture keys after props', () => {
    const list = offered(`${HEAD}  given\n    props |`);
    expect(list?.items.map((i) => [i.label, i.detail])).toEqual([
      ['titulo-largo', '/ws/components/fud-card.fixture.ts'],
      ['vacio', '/ws/components/fud-card.fixture.ts'],
    ]);
    expect(labels(`${HEAD}  given\n    props tit|`)).toEqual(['titulo-largo', 'vacio']);
  });

  it('offers no fixture keys for a second argument, without a component or without a file', () => {
    expect(labels(`${HEAD}  given\n    props vacio |`)).toBeUndefined();
    expect(labels('criterion a\n  given\n    props |')).toBeUndefined();
    expect(labels('component fud-button\ncriterion a\n  given\n    props |')).toBeUndefined();
  });
});
