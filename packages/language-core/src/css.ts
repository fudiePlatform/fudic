/**
 * The CSS virtual files: one per `<style>` (SDD-23 §4.5).
 *
 * The CSS service needs valid CSS, and a `<style>` body is not — it holds Razor. Each Razor
 * region is therefore replaced by a placeholder of **exactly the same length**, which makes
 * the mapping the identity: every offset of the virtual is the same offset in the `.fud`,
 * so no mapping table is needed for the CSS side at all. That is the whole trick, and it is
 * why length matters here and uniqueness does not — the opposite of the formatter (SDD-26
 * §4.3), where the text moves and the placeholder must be findable again. Confusing the two
 * criteria breaks one of the two consumers.
 */

import type {
  ElementNode,
  HtmlContent,
  StructuredDocument,
  StyleNode,
} from '@fudic/compiler';
import { nestedContent } from './imports.js';
import { styleFileName } from './paths.js';
import type { VirtualFile } from './types.js';
import { VirtualWriter } from './writer.js';

/**
 * Emit one CSS virtual per `<style>` of the document.
 *
 * The whole body is copied verbatim except the Razor regions, so the mapping is a single
 * identity stretch and the CSS service reports on the user's own offsets.
 */
export function emitCssVirtuals(source: string, fudPath: string, doc: StructuredDocument): readonly VirtualFile[] {
  return collectStyles(doc).map((style, index) => {
    const w = new VirtualWriter(source);

    // Everything before the body becomes blanks, newlines included, so that the identity
    // claim holds for real: offset N of the virtual IS offset N of the `.fud`, and so are
    // line and column. Starting the file at the body would shift every CSS diagnostic by
    // the length of the markup above it.
    w.scaffold(blankOut(source.slice(0, style.span.start)));

    for (const part of style.parts) {
      if (part.type === 'css-text') w.copy(part.span);
      else w.scaffold(placeholder(part.span.end - part.span.start), part.span);
    }

    return w.build(styleFileName(fudPath, index), 'css');
  });
}

/**
 * Filler of the same length as the region it replaces.
 *
 * An identifier, because that is what a Razor region in CSS almost always stands for — a
 * value (`color: @theme.fg`, `min-width: @bp.tablet`). It cannot be lexically right in
 * every grammatical position at once; where it is not, the resulting complaint is the
 * server's to suppress (SDD-24 §4.4), not the emitter's to guess at.
 */
function placeholder(length: number): string {
  return 'z'.repeat(length);
}

/** Same length, same lines: every character but a newline becomes a space. */
function blankOut(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

/** Every `<style>` body in the document, in source order. */
export function collectStyles(doc: StructuredDocument): readonly StyleNode[] {
  const out: StyleNode[] = [];
  for (const root of roots(doc)) walk(root, out);
  return out;
}

/** The markup roots a document exposes, whatever its role. */
function roots(doc: StructuredDocument): readonly HtmlContent[] {
  switch (doc.type) {
    case 'component-document':
      return [doc.head, doc.host].filter(isElement);
    case 'route-document':
      return [...(doc.head === undefined ? [] : [doc.head]), ...doc.markup, ...doc.sections];
    default:
      return [doc.head, doc.body];
  }
}

function isElement(node: ElementNode | undefined): node is ElementNode {
  return node !== undefined;
}

function walk(node: HtmlContent, out: StyleNode[]): void {
  if (node.type === 'style-content') {
    out.push(node);
    return;
  }
  if (node.type === 'element') {
    for (const child of node.children) walk(child, out);
    return;
  }
  // A `<style>` can also sit inside a section or a control body — the same nesting the
  // alias collector walks, so the two share one notion of "what hosts markup".
  for (const nested of nestedContent(node)) {
    for (const child of nested) walk(child, out);
  }
}
