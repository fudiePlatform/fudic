/**
 * The class names this file declares (BUG-15 §4.1, §4.2).
 *
 * A `class:` completion is the case of a finite, local, ALREADY PARSED list: the names live in
 * the `<style>` of this very file, and the one holding that node is the server, not TypeScript.
 * So nothing is projected and nothing is typed — the names are read off the AST the parser
 * already built (SDD-09) rather than off `source.slice(...)`, which is the smell BUG-08 §3.1
 * left written down.
 *
 * Two places hold a `<style>`, and they are the two the grammar allows: the `<head>` fragment
 * (decision 76) and the `<template>` of a component (decision 77). Both apply to the same
 * shadow root, so offering one and not the other would be arbitrary.
 *
 * Offering is not validating (§4.4): the list is open, it reserves no `FUD` code, and a class
 * that is not in it stays written exactly as it is.
 */

import type { ElementNode, HtmlContent, StructuredDocument, StyleNode } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';

/** Start of a CSS identifier. Never a digit — which is why `.5s` names nothing (§4.2). */
const IDENT_START = /[A-Za-z_-]|[^\x00-\x7F]/;

/** Inside a CSS identifier: the starts, plus digits. */
const IDENT_CHAR = /[-\w]|[^\x00-\x7F]/;

/**
 * The class names offered after `class:`, without the dot, deduplicated, in source order.
 *
 * Empty when the file has no `<style>` — and an empty list is what makes the branch in
 * `completions()` fall back to Emmet instead of silencing it (§4.3).
 */
export function styleClassNames(document: CachedDocument): readonly string[] {
  const scanner = new PreludeScanner();
  for (const style of styleBodies(document.document)) scanner.style(style);
  return scanner.names();
}

/** Every parsed `<style>` body the file reaches, in source order (§4.1). */
function styleBodies(document: StructuredDocument): readonly StyleNode[] {
  const roots: ElementNode[] = [];
  if (document.head !== undefined) roots.push(document.head);
  if (document.type === 'component-document' && document.template !== undefined) {
    roots.push(document.template);
  }

  const bodies: StyleNode[] = [];
  for (const root of roots) collectStyles(root.children, bodies);
  return bodies;
}

/** Depth-first: a `<style>` inside the `<template>` may sit under any element. */
function collectStyles(children: readonly HtmlContent[], out: StyleNode[]): void {
  for (const child of children) {
    if (child.type === 'style-content') out.push(child);
    else if (child.type === 'element') collectStyles(child.children, out);
  }
}

/**
 * Reads the PRELUDES of a `<style>` body, never the declarations (§4.2).
 *
 * The rule is one, and it is what makes every false positive fall out on its own:
 *
 * > A `.name` counts only in selector position — the run of text from the start of the body, a
 * > `{`, a `}` or a `;` UP TO THE NEXT `{`.
 *
 * The second half of that sentence is the half that does the work. A run that ends at a `;` or
 * a `}` never was a prelude, so `background: url(a.png)` contributes nothing without a guard
 * written for it, and neither do `content: ".foo"` or `padding: 0.18rem`. A run that ends at a
 * `{` is a prelude wherever it sits, which is why a nested rule (decision 42.e) needs no case
 * of its own: a nested prelude is still a prelude.
 *
 * So names are read as CANDIDATES and a `{` is what confirms them. Anything else drops them.
 */
class PreludeScanner {
  readonly #names: string[] = [];
  /** Read since the last delimiter. A `{` confirms them; a `;`, a `}` or the end drops them. */
  #pending: string[] = [];

  /** Deduplicated, in order of appearance: the same name in two `<style>` shows up once. */
  names(): readonly string[] {
    return [...new Set(this.#names)];
  }

  /**
   * One `<style>` body, part by part.
   *
   * Only the `CssText` parts are scanned: a `RazorExpression`, an `AtEscapeNode` and a
   * `RazorCommentNode` are skipped whole, because an interpolated name is not a name. A run
   * carries on across an atom — `.a@(x)b` is one prelude — so the candidates survive between
   * parts and only a delimiter clears them.
   */
  style(style: StyleNode): void {
    style.parts.forEach((part, index) => {
      if (part.type !== 'css-text') return;
      const next = style.parts[index + 1];
      this.#run(part.value, next !== undefined && next.type !== 'css-text');
    });
    // The tail of a body is a run that never reached a `{`.
    this.#pending = [];
  }

  /** One literal CSS run. `razorFollows` when a Razor atom comes right after it. */
  #run(text: string, razorFollows: boolean): void {
    let i = 0;
    while (i < text.length) {
      const c = text[i] as string;

      if (c === '/' && text[i + 1] === '*') {
        // `/* .obsoleta { } */` declares nothing, and its braces must not move the state.
        i = skipComment(text, i);
      } else if (c === '"' || c === "'") {
        // Skipped for the same reason: a `{` inside a string would desynchronise the runs.
        i = skipString(text, i, c);
      } else if (c === '{') {
        this.#names.push(...this.#pending);
        this.#pending = [];
        i++;
      } else if (c === '}' || c === ';') {
        this.#pending = [];
        i++;
      } else if (c === '.' && IDENT_START.test(text[i + 1] ?? '')) {
        const end = identEnd(text, i + 1);
        // A name that dies exactly at the edge of a part followed by a Razor atom is a
        // PREFIX, not a name: `.item-@(n)` does not offer `item-`.
        if (end < text.length || !razorFollows) this.#pending.push(text.slice(i + 1, end));
        i = end;
      } else {
        i++;
      }
    }
  }
}

/** Index just past the identifier starting at `start`. */
function identEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && IDENT_CHAR.test(text[end] as string)) end++;
  return end;
}

/** Index just past the comment close, or the end when the comment is left open. */
function skipComment(text: string, i: number): number {
  const end = text.indexOf('*/', i + 2);
  return end === -1 ? text.length : end + 2;
}

/** Index just past the closing quote, or the end when the string is left open. */
function skipString(text: string, i: number, quote: string): number {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === quote) return j + 1;
  }
  return text.length;
}
