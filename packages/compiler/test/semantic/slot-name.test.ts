/**
 * `slot-name` (BUG-23 task 18, criterion 18): `FUD0199`.
 *
 * Against the PARENT and on every element — the two halves of §2.6. A `slot=` with no
 * component above it fills nothing at all, and one whose host declares no such name fills
 * nothing either; the old reading asked the element carrying the attribute, so neither
 * was ever seen.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import { parseSnippet } from '../../src/snippet/index.js';
import { structureDocument } from '../../src/document/index.js';
import type { ComponentRegistry } from '../../src/semantic/index.js';
import { checkSlotName, slotName } from '../../src/semantic/analyzers/slot-name.js';
import type { Diagnostic } from '../../src/types/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective, parseSnippet };

const registry = (slotsOf?: (tag: string) => readonly string[] | undefined): ComponentRegistry => ({
  has: (tag) => tag === 'app-circle',
  ...(slotsOf !== undefined ? { slotsOf } : {}),
});

/** `app-circle` declares one slot; every other tag is unknowable. */
const KNOWN = registry((tag) => (tag === 'app-circle' ? ['PEPITO'] : undefined));

/** A page whose body holds `inner`. */
const page = (inner: string): string =>
  '<!DOCTYPE html>\n<html>\n<head><link rel="component" href="./app-circle.fud"></head>\n' +
  `<body>${inner}</body>\n</html>\n`;

function diagnose(source: string, components: ComponentRegistry = KNOWN): readonly Diagnostic[] {
  const document = structureDocument(
    source,
    parseDocument(source, { atConstructs: constructs }).value,
  ).value;
  const found: Diagnostic[] = [];
  checkSlotName({ document, components }, (d) => void found.push(d));
  return found;
}

const codes = (source: string, components?: ComponentRegistry): readonly string[] =>
  diagnose(source, components).map((d) => d.code);

describe('slot-name — the name the parent does not declare', () => {
  it('reports over the VALUE, and names the host', () => {
    const source = page('<app-circle .name="a"><div slot="p"></div></app-circle>');
    const [diag, ...rest] = diagnose(source);
    expect(rest).toEqual([]);
    expect(diag!.code).toBe('FUD0199');
    expect(diag!.message).toContain('app-circle');
    expect(diag!.message).toContain('`p`');
    const at = source.indexOf('"p"') + 1;
    expect(diag!.span).toEqual({ start: at, end: at + 1 });
  });

  it('the declared name says nothing, whatever depth the control flow adds', () => {
    expect(codes(page('<app-circle><div slot="PEPITO"></div></app-circle>'))).toEqual([]);
    expect(
      codes(page('<app-circle>@if (x) {<div slot="PEPITO"></div>}</app-circle>')),
    ).toEqual([]);
  });

  it('a control body does not lose the host: the wrong name inside an @if still reports', () => {
    expect(codes(page('<app-circle>@if (x) {<div slot="p"></div>}</app-circle>'))).toEqual([
      'FUD0199',
    ]);
  });

  it('a `@section` body does not lose it either', () => {
    const route =
      '<link rel="layout" href="./_layout.fud">\n' +
      '@section nav {\n  <app-circle><div slot="p"></div></app-circle>\n}\n';
    expect(codes(route)).toEqual(['FUD0199']);
  });
});

describe('slot-name — the parent that cannot host anything', () => {
  it('no element above it at all — a route, whose markup IS the fragment', () => {
    const source = '<link rel="layout" href="./_layout.fud">\n<div slot="p"></div>\n';
    const [diag] = diagnose(source);
    expect(diag!.code).toBe('FUD0199');
    expect(diag!.message).toContain('no component parent');
  });

  it('a plain element above it is not a host', () => {
    const [diag] = diagnose(page('<section><div slot="p"></div></section>'));
    expect(diag!.code).toBe('FUD0199');
    expect(diag!.message).toContain('not a component');
  });

  it('a tag the registry knows but cannot read is not an error', () => {
    const unreadable = registry(() => undefined);
    expect(codes(page('<app-circle><div slot="p"></div></app-circle>'), unreadable)).toEqual([]);
  });
});

describe('slot-name — what is not a name', () => {
  it('an empty, absent or interpolated name is nothing to check', () => {
    expect(codes(page('<app-circle><div slot=""></div></app-circle>'))).toEqual([]);
    expect(codes(page('<app-circle><div slot></div></app-circle>'))).toEqual([]);
    expect(codes(page('<app-circle><div slot="@(x)"></div></app-circle>'))).toEqual([]);
  });

  it('an element with other attributes and no `slot` is skipped', () => {
    expect(codes(page('<app-circle><div id="a" class="b"></div></app-circle>'))).toEqual([]);
  });

  it('without `slotsOf` nothing is reported at all (the language server case)', () => {
    expect(codes(page('<div slot="p"></div>'), registry())).toEqual([]);
  });
});

describe('slot-name — the analyzer', () => {
  it('is the same rule under a name the runner can list', () => {
    expect(slotName.name).toBe('slot-name');
    expect(slotName.run).toBe(checkSlotName);
  });
});

describe('slot-name — the `slot:` of a layout hole (SDD-48 §4.5, criterion 7)', () => {
  const layout = (body: string): string =>
    '<!DOCTYPE html>\n<html>\n<head><link rel="component" href="./app-circle.fud">@RenderHead()</head>\n' +
    `<body>${body}</body>\n</html>\n`;

  it('checks it against the component around the hole, over the literal', () => {
    const source = layout('<app-circle>@RenderBody(slot: "p")@RenderSection(n, slot: "PEPITO")</app-circle>');
    const [diag, ...rest] = diagnose(source);
    expect(rest).toEqual([]);
    expect(diag!.code).toBe('FUD0199');
    expect(diag!.message).toBe('`app-circle` declares no slot `p`');
    expect(source.slice(diag!.span.start, diag!.span.end)).toBe('"p"');
  });

  it('reports one with no component around it, and says nothing of a hole with no slot', () => {
    const [diag] = diagnose(layout('<main>@RenderBody(slot: "x")</main>@RenderSection(n)'));
    expect(diag!.message).toBe('`slot: "x"` fills nothing: `main` is not a component');
    expect(diagnose(layout('@RenderBody(slot: "x")')).map((d) => d.message)).toEqual([
      '`slot: "x"` fills nothing: `body` is not a component',
    ]);
  });
});

describe('slot-name — the root of a `@snippet` does not know its component (SDD-48 §4.8, criterion 11)', () => {
  it('leaves a `slot=` at the root of a snippet body alone, even through a construct', () => {
    const source =
      '@snippet pie(texto: string) {\n  <p slot="pie">@texto</p>\n  @if (texto) { <b slot="x">!</b> }\n}\n';
    expect(codes(source)).toEqual([]);
  });

  it('but checks one deeper in the body, against the component the snippet itself writes', () => {
    const source = '@snippet marco() {\n  <app-circle><i slot="p"></i></app-circle>\n}\n';
    expect(codes(source)).toEqual(['FUD0199']);
  });
});
