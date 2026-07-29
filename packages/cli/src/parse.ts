/**
 * The CLI's only door into a `.fud` (SDD-22 §5): the hand-written compiler pipeline,
 * never a regular expression. If the API cannot answer a question the CLI needs, the
 * defect is in the API — this package is its first external consumer, and the language
 * server will ask the same questions.
 */

import {
  parseCodeBlock,
  parseControl,
  parseDirective,
  parseDocument,
  structureDocument,
  type AtConstructParser,
  type Attribute,
  type Diagnostic,
  type ElementNode,
  type StructuredDocument,
} from '@fudic/compiler';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

export interface ParsedFud {
  readonly doc: StructuredDocument;
  readonly diagnostics: readonly Diagnostic[];
}

/** Parse + structure, keeping every diagnostic of both passes. The parser never throws. */
export function parseFud(source: string): ParsedFud {
  const parsed = parseDocument(source, { atConstructs: constructs });
  const structured = structureDocument(source, parsed.value);
  return {
    doc: structured.value,
    diagnostics: [...parsed.diagnostics, ...structured.diagnostics],
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

/**
 * A static attribute value, or `null` when the attribute is absent or interpolated. An
 * interpolated `href` is not something the CLI can compare against or reason about.
 */
export function staticAttr(element: ElementNode, name: string): string | null {
  const attr = element.attributes.find((a: Attribute) => a.name === name);
  if (attr === undefined) return null;
  let text = '';
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return null;
    text += part.value;
  }
  return text;
}
