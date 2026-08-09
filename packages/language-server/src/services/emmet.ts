/**
 * Emmet, and only where markup is.
 *
 * VS Code's own Emmet can be turned on for a language with `emmet.includeLanguages`, and then
 * it reparses the WHOLE file as HTML — so in a `.fud` it offers `<div>` inside `@code`, where
 * the language is TypeScript. It has no way of knowing better: the mapping is per language,
 * never per region.
 *
 * This server does know better, because it has the tree. So Emmet is answered here, gated by
 * the one question the AST can answer and the editor cannot: is this offset markup? The regions
 * that are NOT markup are the `@code` block, the body of a raw element (`<style>`, `<script>` —
 * decision 43), the interpolations and the headers of the control constructs, which are all
 * expressions.
 */

import { doComplete, type VSCodeEmmetConfig } from '@vscode/emmet-helper';
import {
  documentRoots,
  walk,
  type ControlNode,
  type ElementNode,
  type Span,
} from '@fudic/compiler';
import type { CompletionList, Position } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { CachedDocument } from '../document-cache.js';

/**
 * The characters that continue an abbreviation.
 *
 * Without them the editor stops asking after the first `>` of `div>ul>li` — the suggestion list
 * is filtered locally, and `>` matches nothing, so it closes. They are the same set VS Code's
 * Emmet extension registers, minus the ones this service already declares for its own reasons.
 */
export const EMMET_TRIGGER_CHARACTERS = ['!', '.', '}', ':', '*', '$', ']', '>', '+', ')'];

/**
 * `showAbbreviationSuggestions` stays OFF on purpose: those are the snippet names (`a`, `abbr`,
 * `link:css`), and the HTML service already offers every native tag. Two lists of the same
 * thing, one of them worse, is not a feature. What is wanted here is the expansion.
 */
const CONFIG: VSCodeEmmetConfig = {
  showExpandedAbbreviation: 'always',
  showAbbreviationSuggestions: false,
  syntaxProfiles: {},
  variables: {},
  preferences: {},
};

const contains = (span: Span, offset: number): boolean =>
  offset >= span.start && offset <= span.end;

/** The opaque body of a raw element: everything between its two tags. */
function rawBodySpan(element: ElementNode): Span {
  return { start: element.openSpan.end, end: element.closeSpan?.start ?? element.span.end };
}

/**
 * Strictly between the delimiters of a group, so the `(` and the `)` themselves stay markup.
 *
 * The distinction earns its keep at the two boundaries. Just before the `(` the author has
 * typed `@if ` and is about to open the header — still markup, and the `@` transition has to
 * keep working there. Just past the `)` the body begins, and that is where `<ul>` belongs.
 */
const inside = (span: Span, offset: number): boolean => offset > span.start && offset < span.end;

/**
 * The stretches of a control construct that are JavaScript, not markup (BUG-17 §4.3).
 *
 * Every header of every arm — an `@if` chain has one per `else if` — plus the `key (…)`
 * clause. They are collected rather than tested one by one so that the rule lives in a single
 * place: three voices (Emmet, tags, snippets) go quiet through `isMarkupOffset`, and a sixth
 * construct would be one entry here, not three branches scattered across the services.
 *
 * A construct whose `(` never arrived (FUD0070) has an empty header span, and an empty span
 * has no inside — so a degraded node contributes nothing and the file stays markup.
 */
function jsSpansOf(node: ControlNode): readonly Span[] {
  const spans: Span[] =
    node.type === 'if'
      ? node.branches.map((branch) => branch.header.span)
      : [node.header.span];
  if (node.key !== undefined) spans.push(node.key.span);
  return spans;
}

/**
 * Whether this offset is markup, and not one of the regions that only look like it.
 *
 * The `@code` block is taken from the document rather than walked: it is JS, not element
 * content, so `documentRoots` does not reach it — which is exactly why it has to be asked for
 * by name here.
 */
export function isMarkupOffset(cached: CachedDocument, offset: number): boolean {
  const code = cached.document.code;
  if (code !== undefined && contains(code.span, offset)) return false;

  let markup = true;
  walk(documentRoots(cached.document), {
    element: (element) => {
      if (element.kind === 'raw' && contains(rawBodySpan(element), offset)) markup = false;
    },
    interpolation: (expression) => {
      // Start-exclusive, and that is not a detail: a half-written `@fore` parses as an
      // implicit expression, so an inclusive test would say "this is an expression" about the
      // very position where a directive is being typed. The `@` is the boundary — the place
      // the construct BEGINS — and at the boundary the answer is still markup.
      if (offset > expression.span.start && offset <= expression.span.end) markup = false;
    },
    control: (node) => {
      if (jsSpansOf(node).some((span) => inside(span, offset))) markup = false;
    },
  });
  return markup;
}

/**
 * The Emmet expansion for what is being typed, or nothing.
 *
 * The list comes back `isIncomplete`, and it must stay that way: an abbreviation grows with
 * characters that no local filter would keep, so the editor has to ask again on each one.
 */
export function emmetCompletions(
  cached: CachedDocument,
  document: TextDocument,
  position: Position,
): CompletionList | undefined {
  if (!isMarkupOffset(cached, document.offsetAt(position))) return undefined;
  return doComplete(document, position, 'html', CONFIG) ?? undefined;
}
