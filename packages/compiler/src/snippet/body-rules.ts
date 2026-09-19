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

import { type Diagnostic, errorDiag } from '../types/index.js';
import type { ElementNode, HtmlContent } from '../html/index.js';
import type { SnippetDeclNode } from './nodes.js';

/** A `<style>` inside a snippet body: a snippet contributes no CSS (decision 62). */
const FUD_SNIPPET_STYLE = 'FUD0822';
/** A `@code` inside a snippet body: a snippet has no state of its own. */
const FUD_SNIPPET_CODE = 'FUD0823';
/** A `<head>` inside a snippet body: a snippet is not a document. */
const FUD_SNIPPET_HEAD = 'FUD0825';

interface Rule {
  readonly code: string;
  readonly message: string;
}

/** The rule a node of a body breaks, or `undefined`. */
function broken(node: HtmlContent): Rule | undefined {
  if (node.type === 'code') {
    return {
      code: FUD_SNIPPET_CODE,
      message:
        'a @snippet has no @code: it has no state of its own, and every value in its markup arrives as an argument',
    };
  }
  if (node.type !== 'element') return undefined;
  const name = (node as ElementNode).name;
  if (name === 'style') {
    return {
      code: FUD_SNIPPET_STYLE,
      message:
        'a @snippet has no <style>: it contributes no CSS and takes no part in the cascade of the head it expands into',
    };
  }
  if (name === 'head') {
    return { code: FUD_SNIPPET_HEAD, message: 'a @snippet has no <head>: it is markup, not a document' };
  }
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
    if (rule !== undefined) diagnostics.push(errorDiag(rule.code, rule.message, node.span));
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
