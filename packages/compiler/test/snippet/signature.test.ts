/**
 * SDD-29 §6.2 — the signature, read by Oxc off the single batch of the file.
 *
 * What is tested here is the READING: which parameters a signature declares, which of them a
 * call must cover, and that every span comes back in `.fud` coordinates. Whether a call
 * covers them is `check.ts`, and whether the types match is TypeScript's.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { JsBatch } from '../../src/oxc/index.js';
import { readParams, registerSignature, type SnippetParam } from '../../src/snippet/index.js';
import type { SnippetDeclNode } from '../../src/snippet/index.js';
import type { HtmlContent } from '../../src/html/index.js';

function declOf(source: string): SnippetDeclNode {
  const nodes: readonly HtmlContent[] = parseDocument(source, { atConstructs }).value.children;
  return nodes.find((n) => n.type === 'snippet') as unknown as SnippetDeclNode;
}

function paramsOf(source: string): { params: readonly SnippetParam[]; codes: readonly string[] } {
  const batch = new JsBatch(source);
  const id = registerSignature(batch, declOf(source));
  const parsed = batch.parse();
  return {
    params: readParams(parsed.value, id),
    codes: parsed.diagnostics.map((d) => d.code),
  };
}

const text = (source: string, sp: { start: number; end: number }): string =>
  source.slice(sp.start, sp.end);

describe('the signature of a @snippet (§4.1)', () => {
  it('reads a typed parameter, and it is required', () => {
    const source = '@snippet card(title: string) { <i></i> }';
    const { params, codes } = paramsOf(source);
    expect(codes).toEqual([]);
    expect(params).toHaveLength(1);
    const [title] = params;
    expect(title!.name).toBe('title');
    expect(text(source, title!.nameSpan)).toBe('title');
    expect(text(source, title!.typeAnnotation!)).toBe('string');
    expect(title!.required).toBe(true);
    expect(title!.optional).toBe(false);
    expect(title!.declares).toEqual(['title']);
  });

  it('reads a union type with a default, and it is not required (criterion 5)', () => {
    const source = `@snippet card(variant: 'a' | 'b' = 'a') { <i></i> }`;
    const { params } = paramsOf(source);
    const [variant] = params;
    expect(variant!.name).toBe('variant');
    expect(text(source, variant!.typeAnnotation!)).toBe(`'a' | 'b'`);
    expect(text(source, variant!.defaultValue!)).toBe(`'a'`);
    expect(variant!.required).toBe(false);
  });

  it('reads an optional parameter, and it is not required (criterion 6)', () => {
    const source = '@snippet card(subtitle?: string) { <i></i> }';
    const [subtitle] = paramsOf(source).params;
    expect(subtitle!.optional).toBe(true);
    expect(subtitle!.required).toBe(false);
    expect(subtitle!.defaultValue).toBeUndefined();
  });

  it('reads an untyped parameter', () => {
    const [title] = paramsOf('@snippet card(title) { <i></i> }').params;
    expect(title!.name).toBe('title');
    expect(title!.typeAnnotation).toBeUndefined();
    expect(title!.required).toBe(true);
  });

  it('reads a destructuring parameter: no name, but every name it binds', () => {
    const source = '@snippet card({ title, tone: t }: Card) { <i></i> }';
    const [param] = paramsOf(source).params;
    expect(param!.name).toBe('');
    expect(param!.declares).toEqual(['title', 't']);
    // The pattern is what the expansion copies, and it copies JAVASCRIPT: the annotation is cut.
    expect(text(source, param!.pattern)).toBe('{ title, tone: t }');
  });

  it('answers the empty list for an empty signature', () => {
    expect(paramsOf('@snippet spacer() { <hr> }').params).toEqual([]);
  });

  it('reports a `function` written inside the signature, in the signature (criterion 8)', () => {
    const source = '@snippet card(function title: string) { <i></i> }';
    const { params, codes } = paramsOf(source);
    expect(codes).toContain('FUD0170');
    // And it invents no parameters for a list nobody could read: one error, not a cascade.
    expect(params).toEqual([]);
  });

  it('reads nothing from a signature so broken that the wrapper stops being a function', () => {
    const { params } = paramsOf('@snippet card(}) { <i></i> }');
    expect(params).toEqual([]);
  });

  it('reads nothing for a fragment id the batch does not know, and never throws', () => {
    const batch = new JsBatch('@snippet card() { <i></i> }');
    expect(readParams(batch.parse().value, 42)).toEqual([]);
  });

  it('reads nothing for an id registered under another kind, and never throws', () => {
    const source = 'a + b';
    const batch = new JsBatch(source);
    const id = batch.add('expression', { start: 0, end: source.length });
    expect(readParams(batch.parse().value, id)).toEqual([]);
  });

  it('maps every span back into the .fud, never into the synthetic buffer', () => {
    const source = '\n\n\n@snippet card(title: string) { <i></i> }';
    const [title] = paramsOf(source).params;
    expect(source.slice(title!.span.start, title!.span.end)).toBe('title: string');
  });
});
