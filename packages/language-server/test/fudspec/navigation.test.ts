/**
 * SDD-52 criterion 23 — hover and go-to-definition in a `.fudspec`.
 */

import { describe, expect, it } from 'vitest';
import { URI } from 'vscode-uri';
import { specDefinition, specHover } from '../../src/fudspec/navigation.js';
import { specSemanticTokens } from '../../src/fudspec/semantic-tokens.js';
import { FW_TERMS, ROOT, WS_TERMS, cursor, specDocument, world } from './_spec.js';

const FILE = [
  'component fud-card',
  'criterion a',
  '  given',
  '    props vacio',
  '  then',
  '    min-height fud-card 44',
  '    visible role:button',
  '    nope x',
].join('\n');

/** The document and the offset of `needle` in it, `delta` characters in. */
function at(needle: string, delta = 0, text = FILE) {
  const offset = text.indexOf(needle);
  expect(offset, needle).toBeGreaterThan(-1);
  return { spec: specDocument(text), offset: offset + delta };
}

const hoverText = (needle: string, delta = 0, text = FILE, w = world()): string | undefined => {
  const { spec, offset } = at(needle, delta, text);
  const contents = specHover(spec, offset, w.host)?.contents;
  return contents === undefined ? undefined : (contents as { value: string }).value;
};

describe('hover', () => {
  it('shows a term’s signature, describe, layer and path', () => {
    expect(hoverText('min-height', 3)).toBe(
      '```fudspec\nmin-height target:element px:number\n```\n\n```js\n({ target, px }) => `${target} ${px}px`\n```' +
        `\n\nworkspace · \`${WS_TERMS}/then/min-height.js\``,
    );
  });

  it('leaves describe out when the term has none', () => {
    expect(hoverText('visible')).toBe(`\`\`\`fudspec\nvisible target:element\n\`\`\`\n\nframework · \`${FW_TERMS}/then/visible.js\``);
  });

  it('shows the component and the fixture', () => {
    expect(hoverText('fud-card', 4)).toBe(`\`<fud-card>\`\n\n\`${ROOT}/components/fud-card.fud\``);
    expect(hoverText('props', 1)).toBe(`fixture \`vacio\`\n\n\`${ROOT}/components/fud-card.fixture.ts\``);
    expect(hoverText('vacio', 2)).toContain('fixture `vacio`');
  });

  it('ranges over what it is about', () => {
    const { spec, offset } = at('min-height', 1);
    expect(specHover(spec, offset, world().host)?.range).toEqual({
      start: { line: 5, character: 4 },
      end: { line: 5, character: 14 },
    });
  });

  it.each([
    ['an argument', 'fud-card 44', 9],
    ['an unknown term', 'nope', 1],
    ['a keyword', 'criterion', 1],
  ])('says nothing over %s', (_, needle, delta) => {
    expect(hoverText(needle, delta)).toBeUndefined();
  });

  it('says nothing over a component the workspace does not have', () => {
    expect(hoverText('fud-nope', 1, 'component fud-nope\n')).toBeUndefined();
  });

  it.each([
    ['an unknown fixture', 'component fud-card\ncriterion a\n  given\n    props largo\n'],
    ['a role argument', 'component fud-card\ncriterion a\n  given\n    props role:x\n'],
    ['no argument', 'component fud-card\ncriterion a\n  given\n    props\n'],
    ['no component', 'criterion a\n  given\n    props vacio\n'],
    ['no fixture file', 'component fud-button\ncriterion a\n  given\n    props vacio\n'],
  ])('says nothing over props with %s', (_, text) => {
    expect(hoverText('props', 1, text)).toBeUndefined();
  });
});

describe('definition', () => {
  const definition = (needle: string, delta = 0) => {
    const { spec, offset } = at(needle, delta);
    return specDefinition(spec, offset, world().host);
  };
  const TOP = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

  it('opens the module that won, at the top', () => {
    expect(definition('min-height', 2)).toEqual([
      {
        targetUri: URI.file(`${WS_TERMS}/then/min-height.js`).toString(),
        targetRange: TOP,
        targetSelectionRange: TOP,
        originSelectionRange: { start: { line: 5, character: 4 }, end: { line: 5, character: 14 } },
      },
    ]);
  });

  it('opens the component’s .fud at the top', () => {
    expect(definition('fud-card')?.[0]).toMatchObject({
      targetUri: URI.file(`${ROOT}/components/fud-card.fud`).toString(),
      targetRange: TOP,
    });
  });

  it('opens the fixture file at its key', () => {
    const key = { start: { line: 2, character: 2 }, end: { line: 2, character: 7 } };
    expect(definition('vacio')?.[0]).toEqual({
      targetUri: URI.file(`${ROOT}/components/fud-card.fixture.ts`).toString(),
      targetRange: key,
      targetSelectionRange: key,
      originSelectionRange: { start: { line: 3, character: 4 }, end: { line: 3, character: 15 } },
    });
  });

  it('opens nothing where there is nothing', () => {
    expect(definition('nope')).toBeUndefined();
  });
});

describe('semantic tokens (SDD-52 §8.2)', () => {
  it('paints terms by layer and existence, and element arguments as tags', () => {
    const spec = specDocument(FILE);
    const tokens = specSemanticTokens(spec, world().host).map((t) => [FILE.slice(t.span.start, t.span.end), t.type, t.modifiers]);
    expect(tokens).toEqual([
      ['min-height', 'function', []],
      ['fud-card', 'fudComponentTag', []],
      ['visible', 'function', ['defaultLibrary']],
      ['nope', 'function', ['deprecated']],
    ]);
  });
});
