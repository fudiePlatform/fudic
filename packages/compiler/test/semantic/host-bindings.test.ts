/**
 * BUG-32 T5 — FUD0720: what the component's own tag is allowed to carry.
 *
 * The identity tag of decision 75 takes an attribute and an event, and those two reach the
 * output. A `class:` does not, and the reason is not a missing feature: the classes this
 * file knows are the ones its `<style>` declares, and that stylesheet is INSIDE the shadow.
 * A class written on the host is resolved OUTSIDE it, against a page this file cannot see —
 * so the editor would offer names that never apply and the emit would write a class that
 * styles nothing.
 *
 * The rule lives in the semantic pass and not in the emit, like its sister FUD0663
 * (`delegate:` on this very tag): a placement rule belongs where the tree is read.
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
  walk,
  documentRoots,
  documentCode,
  type SemanticInput,
  type ComponentRegistry,
} from '../../src/semantic/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };
const NO_COMPONENTS: ComponentRegistry = { has: () => false };

/** The pipeline's own assembly: parse → structure → batch the JS fragments. */
function buildInput(source: string): SemanticInput {
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

  return { source, document, js, fragmentId: (node) => ids.get(node), components: NO_COMPONENTS };
}

const diags = (source: string): readonly Diagnostic[] => analyze(buildInput(source)).diagnostics;
const codes = (source: string): readonly string[] => diags(source).map((d) => d.code);

/** A component whose identity tag carries `attrs`. */
const host = (attrs: string, inner = '<p>hi</p>'): string =>
  `<app-test ${attrs}><template shadowrootmode="open">${inner}</template></app-test>`;

describe('FUD0720 — a `class:` on the component’s own tag', () => {
  it('is an error, because the class would resolve outside the shadow', () => {
    expect(codes(host('class:active="@on"'))).toContain('FUD0720');
  });

  it('points at the attribute, not at the tag: the span is what the editor underlines', () => {
    const source = host('class:active="@on"');
    const diagnostic = diags(source).find((d) => d.code === 'FUD0720')!;
    expect(source.slice(diagnostic.span.start, diagnostic.span.end)).toBe('class:active="@on"');
  });

  it('says where the class should go instead of only saying no', () => {
    const message = diags(host('class:active="@on"')).find((d) => d.code === 'FUD0720')!.message;
    expect(message).toContain('inside its shadow');
    expect(message).toContain('write the class where it applies');
  });

  it('reports one per binding: two of them are two mistakes, not one', () => {
    expect(codes(host('class:a="@x" class:b="@y"')).filter((c) => c === 'FUD0720')).toHaveLength(2);
  });
});

describe('what the identity tag IS allowed to carry (BUG-32 §3)', () => {
  it('says nothing about a static attribute', () => {
    expect(codes(host('role="group"'))).not.toContain('FUD0720');
  });

  it('says nothing about an interpolated attribute: reflecting is the author’s call', () => {
    expect(codes(host('data-state="@(mode)"'))).not.toContain('FUD0720');
  });

  it('says nothing about an event: a listener on the host is the point of T2', () => {
    expect(codes(host('@click="@toggle()"'))).not.toContain('FUD0720');
  });

  it('says nothing about a plain `class`, which is an attribute like any other', () => {
    // The static one lands on the page's own cascade, where the author wrote it knowing so.
    // It is the BINDING that has no honest meaning here, not the attribute.
    expect(codes(host('class="panel"'))).not.toContain('FUD0720');
  });
});

describe('where the rule does NOT apply', () => {
  it('a `class:` inside the shadow is fine: that is where the stylesheet is', () => {
    expect(codes(host('', '<p class:active="@on">hi</p>'))).not.toContain('FUD0720');
  });

  it('a `class:` on a child component host inside the shadow is fine too', () => {
    expect(codes(host('', '<app-child class:active="@on"></app-child>'))).not.toContain('FUD0720');
  });

  it('a page is not judged: it has no identity tag to carry anything', () => {
    const page = '<!DOCTYPE html>\n<html>\n<head></head>\n<body><p class:a="@x">hi</p></body>\n</html>\n';
    expect(codes(page)).not.toContain('FUD0720');
  });

  it('a component with no attributes at all is not even looked at', () => {
    expect(codes(host(''))).not.toContain('FUD0720');
  });
});
