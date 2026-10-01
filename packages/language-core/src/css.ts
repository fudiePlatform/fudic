/**
 * The CSS virtual files: one per `<style>` (SDD-23 §4.5).
 *
 * Since decision 136 (SDD-49) a `<style>` body is plain CSS, so the virtual is the body
 * itself, at the same offsets: the mapping is the identity, and the CSS service reports on
 * the user's own positions. A `@` written there that is not CSS is `FUD0132`, which fudic's
 * own diagnostics publish.
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
 * Emit one CSS virtual per `<style>` of the document: the body copied verbatim, so the
 * mapping is a single identity stretch.
 */
export function emitCssVirtuals(source: string, fudPath: string, doc: StructuredDocument): readonly VirtualFile[] {
  return collectStyles(doc).map((style, index) => {
    const w = new VirtualWriter(source);

    // Everything before the body becomes blanks, newlines included, so that the identity
    // claim holds for real: offset N of the virtual IS offset N of the `.fud`, and so are
    // line and column. Starting the file at the body would shift every CSS diagnostic by
    // the length of the markup above it.
    w.scaffold(blankOut(source.slice(0, style.span.start)));

    for (const part of style.parts) w.copy(part.span);

    return w.build(styleFileName(fudPath, index), 'css');
  });
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
    case 'snippet-document':
      // A file of snippets has no `<head>` and therefore no stylesheet of its own: a
      // `<style>` inside a body is `FUD0822`. Its bodies are walked all the same, so the one
      // the author is in the middle of deleting is still coloured while it is there.
      return doc.snippets;
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
