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
 * decision 43) and the interpolations, which are all expressions.
 */

import { doComplete, type VSCodeEmmetConfig } from '@vscode/emmet-helper';
import { documentRoots, walk, type ElementNode, type Span } from '@fudic/compiler';
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
