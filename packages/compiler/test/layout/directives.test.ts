/**
 * SDD-21 §6.7 — the four layout directives at the PARSER level: the keywords SDD-04 now
 * reserves, the mandatory parentheses (decision 85), the bare-identifier argument, and the
 * `@section` block. Every degradation is a diagnostic, never an exception.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective, type SectionNode, type RenderSectionNode } from '../../src/layout/index.js';
import { classifyDirective, resolveTrigger } from '../../src/at/index.js';
import type { Diagnostic } from '../../src/types/index.js';
import type { HtmlContent } from '../../src/html/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

function parse(source: string): { nodes: readonly HtmlContent[]; codes: readonly string[] } {
  const result = parseDocument(source, { atConstructs: constructs });
  return { nodes: result.value.children, codes: result.diagnostics.map((d: Diagnostic) => d.code) };
}

/** The first node of `type` anywhere in the tree. */
function find(nodes: readonly HtmlContent[], type: string): HtmlContent | undefined {
  for (const node of nodes) {
    if (node.type === type) return node;
    const children = (node as { children?: readonly HtmlContent[] }).children;
    if (children) {
      const hit = find(children, type);
      if (hit) return hit;
    }
  }
  return undefined;
}

describe('classifyDirective (decision 84)', () => {
  it('reserves exactly the four directive keywords', () => {
    expect(classifyDirective('RenderBody')).toBe('RenderBody');
    expect(classifyDirective('RenderHead')).toBe('RenderHead');
    expect(classifyDirective('RenderSection')).toBe('RenderSection');
    expect(classifyDirective('section')).toBe('section');
    expect(classifyDirective('renderBody')).toBeNull();
    expect(classifyDirective('Section')).toBeNull();
    expect(classifyDirective('data')).toBeNull();
  });

  it('resolves a directive trigger before falling back to an implicit expression', () => {
    const resolved = resolveTrigger('@RenderBody()', 0).value;
    expect(resolved.kind).toBe('directive');
    // A near-miss stays an ordinary interpolation: the set is closed.
    expect(resolveTrigger('@RenderBodies', 0).value.kind).toBe('implicit');
  });
});

describe('@RenderBody() / @RenderHead() (decision 85)', () => {
  it('parses with their mandatory parentheses and spans the whole construct', () => {
    const { nodes, codes } = parse('<main>@RenderBody()</main>');
    const node = find(nodes, 'render-body');
    expect(node).toBeDefined();
    expect(codes).toEqual([]);
    // `@RenderBody()` is 13 chars, starting right after `<main>`.
    expect(node!.span).toEqual({ start: 6, end: 19 });
  });

  it('accepts trivia between the keyword and its parentheses', () => {
    expect(parse('<main>@RenderHead ()</main>').codes).toEqual([]);
    // Razor comments are trivia too (decision 10), around a directive as around an `@if`.
    expect(parse('<main>@RenderBody @* aquí *@ ()</main>').codes).toEqual([]);
    expect(parse('@section s @* aquí *@ { <p>a</p> }').codes).toEqual([]);
  });

  it('reports FUD0432 when the parentheses are missing', () => {
    const { nodes, codes } = parse('<main>@RenderBody</main>');
    expect(codes).toContain('FUD0432');
    // Still produced: the layout keeps its insertion point (recovery).
    expect(find(nodes, 'render-body')).toBeDefined();
  });

  it('reports FUD0433 when given arguments it does not take', () => {
    const { codes } = parse('<main>@RenderBody(x)</main>');
    expect(codes).toContain('FUD0433');
  });
});

describe('@RenderSection(name) (decision 85)', () => {
  it('reads a bare identifier', () => {
    const { nodes, codes } = parse('<body>@RenderSection(scripts)</body>');
    const node = find(nodes, 'render-section') as RenderSectionNode | undefined;
    expect(codes).toEqual([]);
    expect(node?.name).toBe('scripts');
  });

  it('rejects a quoted name with FUD0433', () => {
    const { nodes, codes } = parse('<body>@RenderSection("scripts")</body>');
    expect(codes).toContain('FUD0433');
    expect((find(nodes, 'render-section') as RenderSectionNode | undefined)?.name).toBe('');
  });

  it('rejects a property path with FUD0433', () => {
    const { codes } = parse('<body>@RenderSection(a.b)</body>');
    expect(codes).toContain('FUD0433');
  });
});

describe('@section name { … } (decision 84)', () => {
  it('parses its name and its html body', () => {
    const { nodes, codes } = parse('@section scripts { <p>hi</p> }');
    const node = find(nodes, 'section') as SectionNode | undefined;
    expect(codes).toEqual([]);
    expect(node?.name).toBe('scripts');
    expect(node?.children.some((c) => c.type === 'element')).toBe(true);
  });

  it('nests ordinary Razor inside its body', () => {
    const { nodes, codes } = parse('@section scripts { @if (x) { <p>a</p> } }');
    const node = find(nodes, 'section') as SectionNode | undefined;
    expect(codes).toEqual([]);
    expect(node?.children.some((c) => c.type === 'if')).toBe(true);
  });

  it('reports a missing name with FUD0433 and a missing block with FUD0071', () => {
    expect(parse('@section { <p>a</p> }').codes).toContain('FUD0433');
    expect(parse('@section scripts <p>a</p>').codes).toContain('FUD0071');
  });

  it('reports an unclosed block with FUD0072 without throwing', () => {
    const { codes } = parse('@section scripts { <p>a</p>');
    expect(codes).toContain('FUD0072');
  });
});

describe('degradation without an injected directive parser (SDD-05 §4.5)', () => {
  it('falls back to an unhandled construct plus FUD0055', () => {
    const result = parseDocument('<main>@RenderBody()</main>', {
      atConstructs: { parseControl, parseCodeBlock },
    });
    expect(result.diagnostics.map((d) => d.code)).toContain('FUD0055');
    expect(find(result.value.children, 'unhandled-construct')).toBeDefined();
  });
});
