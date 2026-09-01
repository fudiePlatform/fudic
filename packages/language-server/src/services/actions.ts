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
import { contractIssues, type ContractIssue } from './contract.js';
import { unresolvedHrefs } from './href.js';
import { linkInsertionFor } from './tags.js';
import { loopBindingNames } from './template-scope.js';

/**
 * The command the extension registers to apply an edit WITH its tabstops (SDD-25).
 *
 * Spelled here and re-exported, so the two ends of the contract are one string. A client that
 * does not register it simply never runs the action; nothing is written half-way.
 */
export const SNIPPET_COMMAND = 'fudic.applySnippetEdit';

/**
 * The three characters a snippet reads as syntax, escaped so text the author wrote survives.
 *
 * The rewritten tag carries the author's own attributes across, and one of them holding a `$`
 * — `.href="$route"` — would otherwise become a tabstop the moment the repair is accepted.
 */
const escapeSnippet = (text: string): string => text.replace(/[\\$}]/gu, '\\$&');

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
 * The three repairs of the component contract (BUG-23 §2.6, §4.4).
 *
 * They are anchored on a fact rather than on a diagnostic of ours, and the difference is only
 * in who says it out loud: TypeScript reports all three over the projection, and a second
 * reporter is the duplication BUG-23 removed. What TypeScript cannot do is repair them — its
 * errors land on a synthetic object literal and on a call nobody wrote, so it offers no quick
 * fix at all. The voice stays its; the hands are here.
 *
 * The fact is recomputed from the parse and the index on every request, exactly as the other
 * repairs recompute the diagnostics they hang on, so nothing here can act on a stale span.
 */
function contractFixes(source: string, issue: ContractIssue): readonly Fix[] {
  if (issue.kind === 'missing-props') {
    // ONE edit over the whole open tag, not one per prop, and that is what makes the tabstops
    // possible: a snippet is a single string applied to a single range, so N holes in N places
    // have to be N holes in one rewritten tag. The caret lands in the first value, which is
    // the author's next move after accepting this.
    const holes: Edit[] = [];
    let stop = 0;
    for (const name of issue.names) {
      stop++;
      const written = issue.empty.get(name);
      holes.push(
        written === undefined
          ? { span: span(issue.insertAt, issue.insertAt), newText: ` .${name}="$${stop}"` }
          : { span: written, newText: `.${name}="$${stop}"` },
      );
    }
    // In source order, so the tabstops run left to right however the walk found them.
    holes.sort((a, b) => a.span.start - b.span.start);

    let text = '';
    let cursor = issue.at.start;
    for (const hole of holes) {
      text += escapeSnippet(source.slice(cursor, hole.span.start)) + hole.newText;
      cursor = hole.span.end;
    }
    text += escapeSnippet(source.slice(cursor, issue.at.end));

    return [
      {
        title: `Completar las props requeridas de <${issue.tag}>`,
        edits: [{ span: issue.at, newText: text }],
        snippet: true,
      },
    ];
  }

  if (issue.kind === 'unknown-prop') {
    // No suggestion, no action. A list of every prop the component declares would be a menu,
    // and a bulb that opens a menu is a bulb the author has to read before they can dismiss it.
    if (issue.suggestion === undefined) return [];
    return [
      {
        title: `Cambiar a .${issue.suggestion}`,
        edits: [{ span: issue.at, newText: `.${issue.suggestion}` }],
      },
    ];
  }

  // A slot the host does not declare: one action per slot it DOES declare, and when it
  // declares none the only truthful repair is to take the attribute off — there is nothing
  // for it to be renamed to.
  if (issue.declared.length === 0) {
    return [
      {
        title: `Quitar slot="${issue.written}"`,
        edits: [{ span: issue.attribute, newText: '' }],
      },
    ];
  }
  return issue.declared.map((name) => ({
    title: `Cambiar a slot="${name}"`,
    edits: [{ span: issue.at, newText: name }],
  }));
}

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

  const emit = (fix: Fix): void => {
    const edits = fix.edits.map((edit) => ({
      range: rangeOf(document, edit.span),
      newText: edit.newText,
    }));
    actions.push({
      title: fix.title,
      kind: 'quickfix',
      diagnostics: [],
      // A snippet leaves by `command` and everything else by `edit`, because LSP has no
      // per-edit snippet flag: a `WorkspaceEdit` carrying `$1` would put a literal `$1` in the
      // document. The extension is ours, so the tabstops are applied there, by the one API
      // that knows what they are.
      ...(fix.snippet === true
        ? {
            command: {
              title: fix.title,
              command: SNIPPET_COMMAND,
              arguments: [document.uri, edits[0]?.range, edits[0]?.newText],
            },
          }
        : { edit: { changes: { [document.uri]: edits } } }),
    });
  };

  for (const diagnostic of diagnostics) {
    const repair = REPAIRS.get(diagnostic.code);
    if (repair === undefined) continue;
    if (!overlaps(rangeOf(document, diagnostic.span), range)) continue;

    for (const fix of repair({ cached, index, document, diagnostic })) emit(fix);
  }

  for (const issue of contractIssues(cached, index)) {
    if (!overlaps(rangeOf(document, issue.at), range)) continue;
    for (const fix of contractFixes(cached.source, issue)) emit(fix);
  }

  return actions;
}

/** Which diagnostic codes have a bulb today. Read by the test that guards the table. */
export const REPAIRED_CODES: readonly string[] = [...REPAIRS.keys()];
