/**
 * `component-props` (BUG-23 task 18, criteria 17–19): `FUD0197` and `FUD0198`.
 *
 * The rule is served by the registry, and the registry is what decides whether it speaks at
 * all: without `propsOf` there is nothing to compare against, and silence — not a guess — is
 * the answer. That is what keeps the language server, where TypeScript checks the same two
 * things over the projection, from reporting every one of them twice.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import type { ComponentRegistry } from '../../src/semantic/index.js';
import type { ComponentDeclaredProps } from '../../src/binding/index.js';
import { checkComponentProps, componentProps } from '../../src/semantic/analyzers/component-props.js';
import type { Diagnostic } from '../../src/types/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

const prop = (name: string, required: boolean): ComponentDeclaredProps => ({ name, required });

/** `app-circle` requires `name` and takes an optional `tone`. */
const CIRCLE: readonly ComponentDeclaredProps[] = [prop('name', true), prop('tone', false)];

const registry = (
  propsOf?: (tag: string) => readonly ComponentDeclaredProps[] | undefined,
): ComponentRegistry => ({
  has: (tag) => tag === 'app-circle',
  ...(propsOf !== undefined ? { propsOf } : {}),
});

const KNOWN = registry((tag) => (tag === 'app-circle' ? CIRCLE : undefined));

function diagnose(source: string, components: ComponentRegistry = KNOWN): readonly Diagnostic[] {
  const document = structureDocument(
    source,
    parseDocument(source, { atConstructs: constructs }).value,
  ).value;
  const found: Diagnostic[] = [];
  checkComponentProps({ document, components }, (d) => void found.push(d));
  return found;
}

/** A page whose body holds `inner` — a host that is nobody's own wrapper. */
const page = (inner: string): string =>
  '<!DOCTYPE html>\n<html>\n<head><link rel="component" href="./app-circle.fud"></head>\n' +
  `<body>${inner}</body>\n</html>\n`;

const codes = (source: string, components?: ComponentRegistry): readonly string[] =>
  diagnose(source, components).map((d) => d.code);

describe('component-props — FUD0197, the required prop nobody passed', () => {
  it('reports over the OPENING TAG, and names the prop the way the author must write it', () => {
    const source = page('<app-circle></app-circle>');
    const [diag, ...rest] = diagnose(source);
    expect(rest).toEqual([]);
    expect(diag!.code).toBe('FUD0197');
    expect(diag!.message).toContain('`.name`');
    const at = source.indexOf('<app-circle>');
    expect(diag!.span).toEqual({ start: at, end: at + '<app-circle>'.length });
  });

  it('says nothing once the prop is passed, and nothing about the optional one', () => {
    expect(codes(page('<app-circle .name="Hola"></app-circle>'))).toEqual([]);
    expect(codes(page('<app-circle .name="Hola" .tone="warm"></app-circle>'))).toEqual([]);
  });

  it('lists every missing prop in one diagnostic', () => {
    const both = registry(() => [prop('title', true), prop('href', true)]);
    const [diag] = diagnose(page('<app-circle></app-circle>'), both);
    expect(diag!.message).toContain('`.title`, `.href`');
  });
});

describe('component-props — FUD0198, the prop the child does not declare', () => {
  it('reports over the NAME, not over the whole attribute', () => {
    const source = page('<app-circle .name="a" .colour="red"></app-circle>');
    const [diag, ...rest] = diagnose(source);
    expect(rest).toEqual([]);
    expect(diag!.code).toBe('FUD0198');
    expect(diag!.message).toContain('`colour`');
    const at = source.indexOf('.colour');
    expect(diag!.span).toEqual({ start: at, end: at + '.colour'.length });
  });

  it('a `.` with no name after it belongs to FUD0093, not here', () => {
    expect(codes(page('<app-circle .name="a" .="x"></app-circle>'))).toEqual([]);
  });

  it('an attribute whose name is an expression is not a property', () => {
    expect(codes(page('<app-circle .name="a" bus:(EV)="@h"></app-circle>'))).toEqual([]);
  });
});

describe('component-props — where the rule stays quiet', () => {
  it('without `propsOf` nothing is reported at all (the language server case)', () => {
    expect(codes(page('<app-circle></app-circle>'), registry())).toEqual([]);
  });

  it('a tag the registry cannot answer for is not judged', () => {
    expect(codes(page('<div class="x"></div>'))).toEqual([]);
  });

  it("a component's own host wrapper is its identity, not a use of itself", () => {
    const own =
      '@code {\n  const { name } = props<{ name: string }>();\n}\n' +
      '<app-circle><template shadowrootmode="open"><b>@name</b></template></app-circle>\n';
    expect(codes(own)).toEqual([]);
  });
});

describe('component-props — the analyzer', () => {
  it('is the same rule under a name the runner can list', () => {
    expect(componentProps.name).toBe('component-props');
    expect(componentProps.run).toBe(checkComponentProps);
  });
});
