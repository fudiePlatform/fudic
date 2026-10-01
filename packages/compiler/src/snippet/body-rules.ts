/**
 * What a `@snippet` body may NOT hold (SDD-29 §4.2).
 *
 * Three prohibitions, and they are one idea: a snippet is markup reuse, not a component.
 * It has no stylesheet, because it does not participate in the cascade of anyone's `<head>`
 * (decision 62); it has no `@code`, because it has no state and no environment to run it in;
 * and it has no `<head>`, because it is not a document.
 *
 * The consequence of the second is the one that matters to the rest of the compiler: **a
 * snippet creates no reactivity**. It cannot declare a signal, because it cannot declare
 * anything, so every reactive value in the expanded markup came in as an argument — from the
 * caller, which already had it. A snippet never raises anybody's level; it inherits the level
 * of the place it lands.
 *
 * The fourth prohibition of §4.2 — a nested `@snippet` — is not here: a declaration is a
 * top-level node in every role, and the document pass that knows what "top level" means
 * reports it (`FUD0824`).
 */

import type { Diagnostic, Span } from '../types/index.js';
import { FUD0822, FUD0823, FUD0825 } from '@fudic/diagnostics';
import type { ElementNode, HtmlContent } from '../html/index.js';
import type { SnippetDeclNode } from './nodes.js';

/** A broken rule: the diagnostic it reports, given where. */
type Rule = (span: Span) => Diagnostic;

/** The rule a node of a body breaks, or `undefined`. */
function broken(node: HtmlContent): Rule | undefined {
  // A `@code` inside a snippet body: a snippet has no state of its own.
  if (node.type === 'code') return (span) => FUD0823({ span, where: 'snippet' });
  if (node.type !== 'element') return undefined;
  const name = (node as ElementNode).name;
  // A `<style>`: a snippet contributes no CSS (decision 62).
  if (name === 'style') return (span) => FUD0822({ span });
  // A `<head>`: a snippet is not a document.
  if (name === 'head') return (span) => FUD0825({ span });
  return undefined;
}

/**
 * Report everything a body holds that it may not, anywhere inside it.
 *
 * Depth-first and exhaustive: a `<style>` two elements down is as much a stylesheet as one at
 * the top, and the body keeps every node either way — the file goes on being analyzed, which
 * is what an editor needs from a file that is being written.
 */
function walkBody(nodes: readonly HtmlContent[], diagnostics: Diagnostic[]): void {
  for (const node of nodes) {
    const rule = broken(node);
    if (rule !== undefined) diagnostics.push(rule(node.span));
    const children = (node as { readonly children?: readonly HtmlContent[] }).children;
    if (children !== undefined) walkBody(children, diagnostics);
  }
}

/** Check every declaration of a file. Never throws; the declarations are left untouched. */
export function checkSnippetBodies(
  snippets: readonly SnippetDeclNode[],
  diagnostics: Diagnostic[],
): void {
  for (const snippet of snippets) walkBody(snippet.children, diagnostics);
}
