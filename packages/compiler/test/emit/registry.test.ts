/**
 * The build's `ComponentRegistry` (BUG-23 task 17, criteria 17–19).
 *
 * Only a caller that RESOLVED the graph can say what a child declares, because that is a fact
 * about another file. This is the seam where the semantic pass gets that answer without the
 * pass itself ever touching the filesystem — and where `undefined` keeps meaning «I cannot
 * know» for a tag the graph never reached.
 */

import { describe, expect, it } from 'vitest';
import { resolveComponents, graphRegistry, contractDiagnostics } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** A component `tag` whose shadow root holds `markup`, with `code` in front of it. */
const component = (tag: string, code: string, markup: string): string =>
  `${code}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

const CIRCLE = component(
  'app-circle',
  '@code {\n  const { name, tone = "warm" } = props<{ name: string; tone?: string }>();\n}\n',
  '<b>@name</b><slot name="PEPITO"></slot><slot></slot>',
);

/** A page that links `app-circle` and holds `inner` in its body. */
const page = (inner: string): string =>
  '<!DOCTYPE html>\n<html>\n<head><link rel="component" href="./app-circle.fud"></head>\n' +
  `<body>${inner}</body>\n</html>\n`;

const graphOf = (inner: string, circle: string = CIRCLE): ReturnType<typeof resolveComponents> =>
  resolveComponents('/page.fud', memoryIo({ '/page.fud': page(inner), '/app-circle.fud': circle }));

describe('graphRegistry', () => {
  it('answers the three questions for a component the graph reached', () => {
    const registry = graphRegistry(graphOf('<app-circle .name="a"></app-circle>'));
    expect(registry.has('app-circle')).toBe(true);
    expect(registry.propsOf!('app-circle')).toEqual([
      { name: 'name', required: true },
      { name: 'tone', required: false },
    ]);
    expect(registry.slotsOf!('app-circle')).toEqual(['PEPITO']);
  });

  it('and the two the GRAPH alone can answer: who hydrates, and who writes what', () => {
    // `app-circle` as written declares no signal, no handler and no `@client`, so nothing of
    // it ever comes alive — which is exactly what `FUD0202` is decided on (BUG-24 §4.9).
    const registry = graphRegistry(graphOf('<app-circle .name="a"></app-circle>'));
    expect(registry.hydratable!('app-circle')).toBe(false);
    expect(registry.writes!('app-circle', 'name')).toBe(false);
  });

  it('answers `undefined` — never a guess — for a tag it never reached', () => {
    const registry = graphRegistry(graphOf('<div></div>'));
    expect(registry.has('app-other')).toBe(false);
    expect(registry.propsOf!('app-other')).toBeUndefined();
    expect(registry.slotsOf!('app-other')).toBeUndefined();
    expect(registry.hydratable!('app-other')).toBeUndefined();
    expect(registry.writes!('app-other', 'name')).toBeUndefined();
  });

  it('a slot with no name, an empty one and an interpolated one declare nothing', () => {
    const odd = component(
      'app-circle',
      '',
      '<slot></slot><slot name=""></slot><slot name="@(x)"></slot><slot id="x" name="OK"></slot>',
    );
    const registry = graphRegistry(graphOf('<app-circle></app-circle>', odd));
    expect(registry.slotsOf!('app-circle')).toEqual(['OK']);
  });

  it('a component with no `props<T>()` declares no props at all', () => {
    const bare = component('app-circle', '', '<b>hi</b>');
    expect(graphRegistry(graphOf('<app-circle></app-circle>', bare)).propsOf!('app-circle')).toEqual(
      [],
    );
  });
});

describe('contractDiagnostics — the three the build owes the editor', () => {
  it('FUD0197 over the opening tag of a host that skipped a required prop', () => {
    const found = contractDiagnostics(graphOf('<app-circle></app-circle>'));
    expect(found.map((d) => d.code)).toEqual(['FUD0197']);
    expect(found[0]!.message).toContain('`.name`');
  });

  it('FUD0198 over a `.prop` the child does not declare', () => {
    const found = contractDiagnostics(graphOf('<app-circle .name="a" .colour="red"></app-circle>'));
    expect(found.map((d) => d.code)).toEqual(['FUD0198']);
  });

  it('FUD0199 over a slot the parent does not declare', () => {
    const found = contractDiagnostics(
      graphOf('<app-circle .name="a"><div slot="nope"></div></app-circle>'),
    );
    expect(found.map((d) => d.code)).toEqual(['FUD0199']);
  });

  it('says nothing about a host that honours the contract', () => {
    const ok = graphOf('<app-circle .name="a"><div slot="PEPITO"></div></app-circle>');
    expect(contractDiagnostics(ok)).toEqual([]);
  });

  it('a name the file DECLARES is read like the literal it aliases (criterion 19)', () => {
    // The alias is in the same `@code`, so the file proves what it declares and the contract
    // is as knowable as if it had been written inline.
    const named = component(
      'app-circle',
      '@code {\n  type P = { name: string };\n  const { name } = props<P>();\n}\n',
      '<b>@name</b>',
    );
    const found = contractDiagnostics(graphOf('<app-circle></app-circle>', named));
    expect(found.map((d) => d.code)).toEqual(['FUD0197']);
  });

  it('a type from ANOTHER file proves nothing, so nothing is required (criterion 19)', () => {
    // Nothing here can be resolved without leaving the file, and «I cannot know» has to keep
    // meaning silence: a required prop invented from a name is a red file the author cannot fix.
    const imported = component(
      'app-circle',
      "@code {\n  import type { P } from './p';\n\n  const { name } = props<P>();\n}\n",
      '<b>@name</b>',
    );
    expect(contractDiagnostics(graphOf('<app-circle></app-circle>', imported))).toEqual([]);
  });
});
