/**
 * SDD-12 acceptance criteria (§7): the semantic pass and its analyzers.
 *
 * Inputs are parsed with the REAL SDD-05 parser wired to the REAL SDD-06 control parser and
 * SDD-08 `@code` parser, then structured (SDD-10) and batched through Oxc (SDD-11) exactly as
 * the future pipeline will — so each analyzer runs over an authentic tree + AST, not a forgery.
 * `buildInput` plays the pipeline role (fragment collection is SDD-11 §7 / out of SDD-12).
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId } from '../../src/oxc/index.js';
import type { Node, Diagnostic } from '../../src/types/index.js';
import {
  analyze,
  ANALYZERS,
  walk,
  documentRoots,
  documentCode,
  type SemanticInput,
  type ComponentRegistry,
} from '../../src/semantic/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

const NO_COMPONENTS: ComponentRegistry = { has: () => false };

/** Assemble the SemanticInput the way the pipeline will: parse → structure → batch fragments. */
function buildInput(source: string, components: ComponentRegistry = NO_COMPONENTS): SemanticInput {
  const html = parseDocument(source, { atConstructs: constructs }).value;
  const document = structureDocument(source, html).value;

  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  walk(documentRoots(document), {
    interpolation(expr) {
      ids.set(expr, batch.add('expression', expr.expr));
    },
  });
  const code = documentCode(document);
  if (code) {
    for (const part of code.parts) {
      if (part.type === 'neutral-js') ids.set(part, batch.add('module-statements', part.js));
    }
  }
  const js = batch.parse().value;

  return { source, document, js, fragmentId: (node) => ids.get(node), components };
}

function codes(source: string, components?: ComponentRegistry): readonly string[] {
  const input = components ? buildInput(source, components) : buildInput(source);
  return analyze(input).diagnostics.map((d) => d.code);
}

function diags(source: string, components?: ComponentRegistry): readonly Diagnostic[] {
  const input = components ? buildInput(source, components) : buildInput(source);
  return analyze(input).diagnostics;
}

/** Wrap shadow content in a minimal valid component (DSD host wrapper, decision 75). */
function component(inner: string): string {
  return `<app-test><template shadowrootmode="open">${inner}</template></app-test>`;
}

/** Prefix a `@code` block (before the host, per SDD-10's link→code→head→host order). */
function withCode(code: string, inner = ''): string {
  return `${code}${component(inner)}`;
}

describe('analyze — runner', () => {
  it('exposes every analyzer and returns an empty model (§3, crit. #8)', () => {
    expect(ANALYZERS).toHaveLength(8); // 7 of SDD-12 + layout-load (SDD-21)
    const { value } = analyze(buildInput(component('<p>hi</p>')));
    expect(value).toEqual({});
    expect('strategies' in value).toBe(false); // decisions 63–65 retired: no hydration strategy
  });
});

describe('duplicate-attributes (§7 crit. #2)', () => {
  it('flags the second of two same-named attributes', () => {
    const only = diags(component('<div class="a" class="b"></div>')).filter((d) => d.code === 'FUD0190');
    expect(only).toHaveLength(1);
    // Blamed on the SECOND `class`, not the first.
    const source = component('<div class="a" class="b"></div>');
    expect(source.slice(only[0]!.span.start, only[0]!.span.end)).toBe('class="b"');
  });

  it('does not flag distinct names, and skips expression names (`bus:(expr)`)', () => {
    expect(codes(component('<div class="a" id="b"></div>'))).not.toContain('FUD0190');
    // The `bus:(expr)` name is a RazorExpression, not statically comparable → skipped.
    expect(codes(component('<div bus:(evt)="@h" class="a" class="b"></div>')).filter((c) => c === 'FUD0190')).toHaveLength(1);
  });
});

describe('ref-in-loop (§7 crit. #3)', () => {
  it('flags a ref inside @foreach/@for/@while, not outside', () => {
    expect(codes(component('@foreach (const x of xs) { <input ref="@r"> }'))).toContain('FUD0192');
    expect(codes(component('@for (let i = 0; i < n; i++) { <input ref="@r"> }'))).toContain('FUD0192');
    expect(codes(component('@while (go) { <input ref="@r"> }'))).toContain('FUD0192');
    expect(codes(component('<input ref="@r">'))).not.toContain('FUD0192');
  });

  it('does not treat @if/@switch as loops', () => {
    expect(codes(component('@if (a) { <input ref="@r"> } else { <input ref="@s"> }'))).not.toContain('FUD0192');
    expect(codes(component('@switch (x) { case 1: <input ref="@r"> }'))).not.toContain('FUD0192');
  });

  it('ignores non-ref attributes on elements inside a loop', () => {
    // The loop body has an element whose attributes are all non-ref.
    expect(codes(component('@foreach (const x of xs) { <input type="text" name="q"> }'))).not.toContain('FUD0192');
    // …and an @if with no else still walks (its arm carries the ref).
    expect(codes(component('@foreach (const x of xs) { @if (x) { <input ref="@r"> } }'))).toContain('FUD0192');
  });
});

describe('code-region-uniqueness (§7 crit. #4)', () => {
  it('flags a repeated @server / @client, accepts one of each', () => {
    expect(codes(withCode('@code { @server {} @server {} }'))).toContain('FUD0194');
    expect(codes(withCode('@code { @client {} @client {} }'))).toContain('FUD0194');
    expect(codes(withCode('@code { @server {} @client {} }'))).not.toContain('FUD0194');
  });
});

describe('code-region-nesting (§7 crit. #5)', () => {
  it('flags a @server nested inside a @client (text scan)', () => {
    expect(codes(withCode('@code { @client { @server {} } }'))).toContain('FUD0193');
  });

  it('does not flag sibling regions', () => {
    expect(codes(withCode('@code { @server {} @client {} }'))).not.toContain('FUD0193');
  });
});

describe('neutral-imports (§7 crit. #9)', () => {
  it('warns on a side-effect import, allows a named import', () => {
    const d = diags(withCode("@code { import './reset.css'; }")).filter((x) => x.code === 'FUD0196');
    expect(d).toHaveLength(1);
    expect(d[0]!.severity).toBe('warning');
    expect(codes(withCode("@code { import { x } from './m'; }"))).not.toContain('FUD0196');
  });
});

describe('primitive-interpolation (§7 crit. #6)', () => {
  it('flags an evident array/object literal, not a plain reference', () => {
    expect(codes(component('@([1, 2, 3])'))).toContain('FUD0195');
    expect(codes(component('@({ a: 1 })'))).toContain('FUD0195');
    // User-written parens around the literal are peeled before the check.
    expect(codes(component('@(([1, 2, 3]))'))).toContain('FUD0195');
    expect(codes(component('@title'))).not.toContain('FUD0195');
    // @raw content is still an interpolation: a reference does not trip the rule.
    expect(codes(component('@raw(safeHtml)'))).not.toContain('FUD0195');
  });
});

describe('component-declared (§7 crit. #7)', () => {
  it('flags an unregistered custom element, once, excluding the host wrapper', () => {
    const only = codes(component('<app-card></app-card>')).filter((c) => c === 'FUD0191');
    expect(only).toHaveLength(1); // app-test host is NOT flagged, only app-card
  });

  it('does not flag a registered component, nor a plain element, nor svg descendants', () => {
    const registry: ComponentRegistry = { has: (t) => t === 'app-card' };
    expect(codes(component('<app-card></app-card>'), registry)).not.toContain('FUD0191');
    expect(codes(component('<div></div>'))).not.toContain('FUD0191');
    // decision 41.b: a hyphenated svg element is not a custom element.
    expect(codes(component('<svg><my-shape></my-shape></svg>'))).not.toContain('FUD0191');
  });

  it('checks custom elements in a page body too', () => {
    const page =
      '<!DOCTYPE html><html><head></head><body><app-card></app-card></body></html>';
    expect(codes(page)).toContain('FUD0191');
  });
});

describe('LSP invariants (§6)', () => {
  it('skips JS-bearing nodes whose fragment was never registered (no AST)', () => {
    // fragmentId always misses: the AST-based analyzers must skip, not throw.
    const source = withCode("@code { import './reset.css'; }", '@([1, 2, 3])');
    const html = parseDocument(source, { atConstructs: constructs }).value;
    const document = structureDocument(source, html).value;
    const empty = new JsBatch(source).parse().value;
    const input: SemanticInput = {
      source,
      document,
      js: empty,
      fragmentId: () => undefined,
      components: NO_COMPONENTS,
    };
    const c = analyze(input).diagnostics.map((d) => d.code);
    expect(c).not.toContain('FUD0195'); // interpolation skipped
    expect(c).not.toContain('FUD0196'); // neutral import skipped
  });

  it('a document with no @code produces no region diagnostics', () => {
    const c = codes(component('<p>plain</p>'));
    expect(c).not.toContain('FUD0193');
    expect(c).not.toContain('FUD0194');
    expect(c).not.toContain('FUD0196');
  });

  it('walks a component head fragment and a hostless (degraded) component without throwing', () => {
    // Head fragment present (decision 62): its subtree is a walk root.
    const withHead =
      '<head><style>p{color:red}</style></head><app-test><template shadowrootmode="open"><app-card></app-card></template></app-test>';
    expect(codes(withHead)).toContain('FUD0191'); // app-card still checked

    // No hyphenated root ⇒ host is absent (FUD0156 in SDD-10); analyze still runs, walks nothing.
    expect(() => analyze(buildInput('<div></div>'))).not.toThrow();
  });
});
