/**
 * SDD-53 §4.4, criteria 14–16 — the snippets of a `.fudspec`, built and offered.
 */

import { describe, expect, it } from 'vitest';
import { parseSpec, validateSpec, type TermModule } from '@fudic/spec';
import type { CompletionItem } from 'vscode-languageserver-protocol';
import { specCompletions } from '../../src/fudspec/completion.js';
import type { SpecHost } from '../../src/fudspec/host.js';
import {
  componentSnippet,
  criterionSnippet,
  propsSnippet,
  siblingTag,
  termSnippet,
} from '../../src/fudspec/snippets.js';
import { FILES, ROOT, SPEC_PATH, cursor, specDocument, world } from './_spec.js';

const OTHER = `${ROOT}/components/other.fudspec`;

/** A snippet as the editor inserts it when every stop keeps its default: the first choice. */
function expand(snippet: string): string {
  return snippet
    .replace(/\$\{\d+\|((?:\\.|[^,|\\])*)(?:,(?:\\.|[^|\\])*)*\|\}/gu, (_, first: string) => first.replace(/\\(.)/gu, '$1'))
    .replace(/\$\{\d+:((?:\\.|[^}\\])*)\}/gu, (_, value: string) => value.replace(/\\(.)/gu, '$1'))
    .replace(/\$\d+/gu, '');
}

const module = (name: string, params: TermModule['params']): TermModule => ({
  layer: 'workspace',
  path: `/ws/fudic/terms/then/${name}.js`,
  block: 'then',
  name,
  params,
  diagnostics: [],
});

describe('siblingTag', () => {
  it('is the file name without .fudspec', () => {
    expect(siblingTag(specDocument('', SPEC_PATH))).toBe('fud-card');
    expect(siblingTag(specDocument('', '/x/app-probe.fudspec'))).toBe('app-probe');
  });
});

describe('componentSnippet (criterion 14)', () => {
  const { host } = world();

  it('puts the sibling first when it is a component, then the other tags', () => {
    expect(componentSnippet(specDocument(''), host)).toBe('component ${1|fud-card,fud-button|}');
  });

  it('keeps alphabetical order when the sibling is not a component', () => {
    expect(componentSnippet(specDocument('', OTHER), host)).toBe('component ${1|fud-button,fud-card|}');
  });

  it('is a placeholder with one tag, and a bare stop with none', () => {
    const one = world({ fuds: { [`${ROOT}/components/fud-card.fud`]: FILES_FUD } });
    expect(componentSnippet(specDocument(''), one.host)).toBe('component ${1:fud-card}');
    const none = world({ fuds: {} });
    expect(componentSnippet(specDocument(''), none.host)).toBe('component ${1:tag}');
  });
});

const FILES_FUD = '<fud-card>\n  <template shadowrootmode="open"></template>\n</fud-card>\n';

describe('propsSnippet', () => {
  it('offers the fixture keys of the declared component', () => {
    expect(propsSnippet(specDocument('component fud-card\n'), world().host)).toBe('props ${1|titulo-largo,vacio|}');
  });

  it('offers base without a fixture file, a component line or any key', () => {
    const { host } = world();
    expect(propsSnippet(specDocument('component fud-button\n'), host)).toBe('props ${1:base}');
    expect(propsSnippet(specDocument('criterion a\n'), host)).toBe('props ${1:base}');
    const empty = world({ files: { ...FILES, [`${ROOT}/components/fud-card.fixture.ts`]: 'export default {};\n' } });
    expect(propsSnippet(specDocument('component fud-card\n'), empty.host, 3)).toBe('props ${3:base}');
  });

  it('escapes what the snippet syntax reserves', () => {
    const fixture = "export default { 'a,b': {}, 'c|d': {}, '$e': {}, 'f}': {}, 'g\\\\h': {} };\n";
    const odd = world({ files: { ...FILES, [`${ROOT}/components/fud-card.fixture.ts`]: fixture } });
    expect(propsSnippet(specDocument('component fud-card\n'), odd.host)).toBe(
      'props ${1|a\\,b,c\\|d,\\$e,f\\},g\\\\h|}',
    );
    const single = world({ files: { ...FILES, [`${ROOT}/components/fud-card.fixture.ts`]: "export default { '$a}\\\\': {} };\n" } });
    expect(propsSnippet(specDocument('component fud-card\n'), single.host)).toBe('props ${1:\\$a\\}\\\\}');
  });
});

describe('criterionSnippet (criterion 15)', () => {
  it('has a slug, a given with props when the component needs them, and a then', () => {
    expect(criterionSnippet(specDocument('component fud-card\n'), world().host)).toBe(
      'criterion ${1:slug}\n  given\n    props ${2|titulo-largo,vacio|}\n  then\n    $0',
    );
  });

  it('leaves the given empty when no prop is required, or none can be proven', () => {
    const plain = 'criterion ${1:slug}\n  given\n    $2\n  then\n    $0';
    const { host } = world();
    expect(criterionSnippet(specDocument('component fud-button\n'), host)).toBe(plain);
    expect(criterionSnippet(specDocument(''), host)).toBe(plain);
    expect(criterionSnippet(specDocument('component nope\n'), host)).toBe(plain);
    const unknown = {
      component: () => ({ tag: 'x-y', path: '/x-y.fud', requiredProps: 'unknown' }),
      fixtures: () => undefined,
    } as unknown as SpecHost;
    expect(criterionSnippet(specDocument('component x-y\n'), unknown)).toBe(plain);
  });

  it('inserted, gives only FUD0934 (empty blocks) until its stops are filled', () => {
    for (const head of ['component fud-button\n\n', 'component fud-card\n\n']) {
      const { host } = world();
      const text = head + expand(criterionSnippet(specDocument(head), host));
      const spec = parseSpec(text);
      const codes = [...spec.diagnostics, ...validateSpec(spec.value, host.context(SPEC_PATH))].map((d) => d.code);
      expect(codes.length).toBeGreaterThan(0);
      expect(new Set(codes)).toEqual(new Set(['FUD0934']));
    }
  });
});

describe('termSnippet (criterion 16)', () => {
  const { host } = world();

  it('has one stop per parameter: the tags and role: for an element, the name otherwise', () => {
    expect(
      termSnippet(
        module('min-height', [
          { name: 'target', type: 'element' },
          { name: 'px', type: 'number' },
        ]),
        host,
      ),
    ).toBe('min-height ${1|fud-button,fud-card,role:|} ${2:px}');
    expect(termSnippet(module('ready', []), host)).toBe('ready');
    expect(termSnippet(module('odd', [{ name: '$x', type: 'string' }]), host)).toBe('odd ${1:\\$x}');
  });
});

describe('the snippets as completion offers them (criteria 14 and 16)', () => {
  const offered = (marked: string, path = SPEC_PATH): readonly CompletionItem[] => {
    const { text, offset } = cursor(marked);
    return specCompletions(specDocument(text, path), offset, world().host)?.items ?? [];
  };

  it('in an empty fud-card.fudspec, the first item is the component snippet, preselected, with fud-card first', () => {
    const items = offered('|');
    expect(items[0]).toEqual({
      label: 'component',
      kind: 15,
      detail: 'component <tag>',
      insertText: 'component ${1|fud-card,fud-button|}',
      insertTextFormat: 2,
      preselect: true,
      sortText: '0',
    });
    expect(items.filter((i) => i.preselect === true)).toHaveLength(1);
  });

  it('offers the criterion snippet with the props the component needs', () => {
    const criterion = offered('component fud-card\n|').find((i) => i.kind === 15);
    expect(criterion).toMatchObject({ label: 'criterion', insertTextFormat: 2 });
    expect(criterion?.insertText).toContain('props ${2|titulo-largo,vacio|}');
  });

  it('inserts props under given as a snippet with the fixture keys, and keeps the keywords at column 2', () => {
    const props = offered('component fud-card\ncriterion a\n  given\n    |').find((i) => i.label === 'props');
    expect(props).toMatchObject({ insertText: 'props ${1|titulo-largo,vacio|}', insertTextFormat: 2 });
    expect(offered('component fud-card\ncriterion a\n  |').map((i) => i.label)).toEqual(['given', 'when', 'then']);
  });
});
