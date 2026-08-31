/**
 * The light bulb (SDD-36 §3.1, §4.1).
 *
 * Every action here is anchored on a DIAGNOSTIC, never on the position of the cursor. The
 * difference is what keeps the bulb honest: "quote the value" appears where the compiler says
 * the value is unquoted and nowhere else, so a bulb that shows up is always a bulb with
 * something to fix. One that appears over healthy code trains the developer to ignore it.
 *
 * Nothing here re-derives what is already parsed. The `<link>` comes from `linkInsertionFor`,
 * which is the same edit the tag completion writes; the binding of a loop comes from the
 * headers registered in the `JsBatch`, which is the same place the template scope reads. Two
 * sources for one fact is how the editor and the build came to disagree in BUG-23.
 *
 * Every action carries its `WorkspaceEdit` whole: no `command`, no `resolve`. An action that
 * has to be resolved is an action that can fail after the user accepted it, and the failure
 * lands in the document.
 */

import type { CodeAction, Range } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { span, type Diagnostic, type Span } from '@fudic/compiler';
import { URI } from 'vscode-uri';
import type { CachedDocument } from '../document-cache.js';
import { relativeHref } from '../paths.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { unresolvedHrefs } from './href.js';
import { linkInsertionFor } from './tags.js';
import { loopBindingNames } from './template-scope.js';

/** What every repair is handed: the document, the index, and the diagnostic it repairs. */
interface Repair {
  readonly cached: CachedDocument;
  readonly index: WorkspaceIndex;
  readonly document: TextDocument;
  readonly diagnostic: Diagnostic;
}

/** One replacement of a stretch of the `.fud` being edited. */
interface Edit {
  readonly span: Span;
  readonly newText: string;
}

/**
 * A quick fix over the file being edited.
 *
 * `snippet` says the text carries tabstops. LSP has no per-edit snippet flag, so the caller
 * turns it into the client's own shape; keeping the fact here rather than baking `$1` into a
 * plain edit is what stops a literal `$1` from ever reaching a document.
 */
interface Fix {
  readonly title: string;
  readonly edits: readonly Edit[];
  readonly snippet?: boolean;
}

/** The repairs of one diagnostic code. Empty means this code has no bulb. */
type Repairer = (repair: Repair) => readonly Fix[];

/**
 * `FUD0056` — an unquoted value the grammar cannot read.
 *
 * The repair is the whole of what the compiler asks for: put quotes around what is there. It
 * touches the value and nothing else — not the attribute name, not the `=` — because the
 * author's mistake is the quoting and re-writing more than that would be an opinion.
 *
 * The diagnostic's own span IS the value: the parser reports on the stretch it could not read,
 * so nothing has to be searched for. That is why this repair needs no tree at all.
 */
const quoteValue: Repairer = ({ cached, diagnostic }) => {
  const text = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  // Nothing to quote, and a `"` already there means the parser is reporting something else
  // about a value that IS quoted — in neither case is adding a pair of quotes the answer.
  if (text === '' || text.includes('"')) return [];

  return [
    { title: 'Entrecomillar el valor', edits: [{ span: diagnostic.span, newText: `"${text}"` }] },
  ];
};

/**
 * Whether an open tag — `<app-badge class="x">` — is the opening of `tag`.
 *
 * The boundary is the whole of it. A prefix test alone reads `<app-badge-large>` as opening
 * `app-badge`, and the repair would then add the link of a component the author did not write.
 * Past the end of the string `charAt` gives `''`, which matches nothing, so a bare `<app-badge`
 * still being typed is recognised.
 */
const opensTag = (opened: string, tag: string): boolean =>
  tag !== '' && opened.startsWith(`<${tag}`) && !/[-\w]/u.test(opened.charAt(tag.length + 1));

/**
 * `FUD0191` — a custom element with no `<link rel="component">`.
 *
 * The `href` is not guessed: the index knows every `.fud` of the workspace and which tag each
 * one defines, so the repair exists only for a tag the index has actually seen. And the edit is
 * `linkInsertionFor`'s, the very one the tag completion writes when it adds a link — so the two
 * cannot drift apart, which is the point of the rule that one fact has one source.
 */
const addComponentLink: Repairer = ({ cached, index, diagnostic }) => {
  // The diagnostic underlines the whole OPEN TAG — `<app-badge class="x">` — because that is
  // what the author has to look at. Rather than read a name out of it and then look that name
  // up, the question is asked the other way round: which component of the workspace does this
  // open tag open? That has one answer or none, and neither is a case the code has to invent a
  // value for — a name parsed out of the span would need an «unreadable» branch that no input
  // can reach and therefore no test can cover.
  const opened = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  const entry = index
    .byRole('component')
    .find((candidate) => candidate.path !== cached.path && opensTag(opened, candidate.tag));
  if (entry === undefined) return [];

  const tag = entry.tag;

  // Always an insertion, never `undefined`: `linkInsertionFor` declines only a file that already
  // links the href, and a file that links it does not get `FUD0191` in the first place. The
  // diagnostic and the repair read the same fact, so they cannot disagree about it.
  const insertion = linkInsertionFor(cached, relativeHref(cached.path, entry.path)) as {
    span: Span;
    newText: string;
  };

  return [
    {
      title: `Añadir <link rel="component"> de <${tag}>`,
      edits: [{ span: insertion.span, newText: insertion.newText }],
    },
  ];
};

/**
 * `FUD0540` — a loop that renders markup and declares no `key (…)`.
 *
 * The binding comes from the header Oxc already parsed, which is the same source the template
 * scope reads (`DocumentJs.loops`). A header that declares several — `const { id, tag } of xs` —
 * offers the first; one that declares none offers nothing, because that is `FUD0543` and it has
 * its own message. Writing `key ()` empty would trade one diagnostic for another.
 *
 * The diagnostic's span is the header, so the insertion point is its end plus the `)` that
 * closes it — the `key (…)` goes between the header and the `{` (decision 91).
 */
const addLoopKey: Repairer = ({ cached, diagnostic }) => {
  const loop = cached.js.loops.find(
    (candidate) =>
      candidate.span.start <= diagnostic.span.start && diagnostic.span.end <= candidate.span.end,
  );
  if (loop?.statement === undefined) return [];

  const binding = loopBindingNames(loop.statement)[0];
  if (binding === undefined) return [];

  // `headerClose` is past the `)`, straight from the balancer: the key goes between the header
  // and the `{` (decision 91), and nothing has to be searched for to find it.
  const at = loop.headerClose;
  return [
    {
      title: `Añadir key (${binding})`,
      edits: [{ span: span(at, at), newText: ` key (${binding})` }],
    },
  ];
};

/**
 * The table: a diagnostic code, and what repairs it.
 *
 * A code that is not here has no bulb, and that is the normal case — most diagnostics describe
 * a decision only the author can make. Adding a row is the whole cost of adding a quick fix.
 */
const REPAIRS: ReadonlyMap<string, Repairer> = new Map<string, Repairer>([
  ['FUD0056', quoteValue],
  ['FUD0191', addComponentLink],
  ['FUD0540', addLoopKey],
]);

/**
 * The `href` that does not resolve, which was here before the table and stays outside it.
 *
 * Its repair CREATES A FILE rather than editing this one, so it produces a different kind of
 * `WorkspaceEdit` and has no `Edit` to return. Forcing it into the table would mean widening
 * `Fix` to cover a case it has exactly one of.
 */
function hrefActions(
  cached: CachedDocument,
  index: WorkspaceIndex,
  document: TextDocument,
  range: Range,
  rangeOf: (document: TextDocument, at: Span) => Range,
  overlaps: (a: Range, b: Range) => boolean,
): CodeAction[] {
  return unresolvedHrefs(cached, index)
    .filter((unresolved) => overlaps(rangeOf(document, unresolved.value), range))
    .map((unresolved) => ({
      title: `Create ${unresolved.href}`,
      kind: 'quickfix',
      edit: {
        documentChanges: [
          {
            kind: 'create' as const,
            uri: URI.file(unresolved.target).toString(),
            options: { ignoreIfExists: true },
          },
        ],
      },
    }));
}

/** Everything the router needs from the plugin, so this module imports no LSP plumbing. */
export interface ActionDeps {
  readonly cached: CachedDocument;
  readonly index: WorkspaceIndex;
  readonly document: TextDocument;
  readonly range: Range;
  /** The diagnostics the server itself computed for this document. */
  readonly diagnostics: readonly Diagnostic[];
  rangeOf(document: TextDocument, at: Span): Range;
  overlaps(a: Range, b: Range): boolean;
}

/**
 * Every quick fix that applies inside `range`.
 *
 * The diagnostics are the server's OWN, not the ones the client sent in the code-action
 * context. A client is free to send a stale set — VS Code sends what it last rendered — and a
 * repair computed against a stale span edits the wrong stretch. Recomputing costs nothing here:
 * the parse and the Oxc batch are the cache's, already done.
 */
export function codeActions(deps: ActionDeps): CodeAction[] {
  const { cached, index, document, range, diagnostics, rangeOf, overlaps } = deps;

  const actions = hrefActions(cached, index, document, range, rangeOf, overlaps);

  for (const diagnostic of diagnostics) {
    const repair = REPAIRS.get(diagnostic.code);
    if (repair === undefined) continue;
    if (!overlaps(rangeOf(document, diagnostic.span), range)) continue;

    for (const fix of repair({ cached, index, document, diagnostic })) {
      actions.push({
        title: fix.title,
        kind: 'quickfix',
        diagnostics: [],
        edit: {
          changes: {
            [document.uri]: fix.edits.map((edit) => ({
              range: rangeOf(document, edit.span),
              newText: edit.newText,
            })),
          },
        },
      });
    }
  }

  return actions;
}

/** Which diagnostic codes have a bulb today. Read by the test that guards the table. */
export const REPAIRED_CODES: readonly string[] = [...REPAIRS.keys()];
