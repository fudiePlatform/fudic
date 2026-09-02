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
import type { PropDetail, PropHolds } from './tag-card.js';
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
 * A quick fix over the file being edited. A title and a `WorkspaceEdit`, and nothing else.
 *
 * There was a version of this that could carry TABSTOPS, by sending a `command` for the
 * extension to apply as a snippet instead of an `edit`. It never once worked in the editor, and
 * the trace says why in one line: the `document` a plugin is handed is Volar's, and its uri is
 *
 *     volar-embedded-content://root/file%253A%252F%252F%252Fc%25253A%252F…
 *
 * not the `.fud`. Volar rewrites the uri of an `edit` on its way out — which is exactly why
 * every other repair here lands — and it cannot rewrite the ARGUMENTS of a command, because
 * nothing in them announces itself as a uri. So the command arrived pointing at a virtual
 * document, found no editor, and `applyEdit` on a document nobody can write returned `false` in
 * silence. A bulb that opens onto nothing.
 *
 * The tabstops are not worth a second delivery path. `.id=""` with the caret elsewhere is a
 * repair; a repair that never happens is not.
 */
interface Fix {
  readonly title: string;
  readonly edits: readonly Edit[];
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

/** What a prop's type is asked from: the projection of the file that declares the component. */
export type PropLookup = (file: string) => ReadonlyMap<string, PropDetail>;

/**
 * The value to write for a prop, in the shape its TYPE holds.
 *
 * A quoted attribute value in a `.fud` is TEXT, so `.id=""` passes the string `""` — and a `.id`
 * the component declared as `number` is then a type error the repair itself created. A bulb that
 * leaves the file worse than it found it is worse than no bulb at all.
 *
 * A scalar is written BARE, which is what decision 105 is for: after the `=` of a `.prop` a
 * number, `true`, `false`, `null` and `undefined` are legal with no quotes and no `@`. So
 * `.id=0` and `.visible=false`, exactly as the author would write them. An interpolation here
 * would be a second spelling for something the grammar already has one of — `@( … )` is for
 * EXPRESSIONS (decisions 103, 104), and `0` is not an expression.
 *
 * `0`, `""` and `false` are placeholders in the sense that the author will replace them, not in
 * the sense that they are wrong: the file compiles the moment the repair is accepted, which is
 * the difference between a file with a hole in it and a file with an error in it.
 *
 * Anything else gets an empty `@()` — and there it IS an expression, because an object or a
 * function is only ever passed as one. There is no obvious value to invent for those, and
 * inventing one would be putting words in the author's mouth. A prop whose type never arrived —
 * TypeScript not loaded, the program not built — takes `""`, which is what most props take.
 */
const HOLES: Readonly<Record<PropHolds, string>> = {
  string: '""',
  number: '0',
  boolean: 'false',
  other: '@()',
};

function holeFor(details: ReadonlyMap<string, PropDetail>, name: string): string {
  const holds = details.get(name)?.holds;
  return holds === undefined ? HOLES.string : HOLES[holds];
}

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
function contractFixes(issue: ContractIssue, propsOf: PropLookup): readonly Fix[] {
  if (issue.kind === 'missing-props') {
    // The tag's own text is not touched: a prop written with an empty value has that attribute
    // replaced, and every prop that is missing altogether arrives in ONE insertion before the
    // `>`. One and not several, because two zero-length inserts at the same offset are two
    // edits a client is free to order either way — and «`.id`, then `.name`» is not something
    // to leave to a client's sort.
    const details = propsOf(issue.file);
    const edits: Edit[] = [];
    const absent: string[] = [];
    for (const name of issue.names) {
      const written = issue.empty.get(name);
      if (written === undefined) absent.push(name);
      else edits.push({ span: written, newText: `.${name}=${holeFor(details, name)}` });
    }
    if (absent.length > 0) {
      edits.push({
        span: span(issue.insertAt, issue.insertAt),
        newText: absent.map((name) => ` .${name}=${holeFor(details, name)}`).join(''),
      });
    }

    return [
      {
        title: `Completar las props requeridas de <${issue.tag}>`,
        // In source order: the edits of one `WorkspaceEdit` may not overlap, and a client is
        // entitled to refuse a set that arrives out of order.
        edits: edits.sort((a, b) => a.span.start - b.span.start),
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
  /**
   * The props of another component, from the projection. Empty is a normal answer.
   *
   * Injected rather than reached for, because this module knows nothing about TypeScript and
   * has no business learning: what it needs is «can this prop hold a string», and that is a
   * question, not a program.
   */
  propsOf: PropLookup;
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
  const { cached, index, document, range, diagnostics, rangeOf, overlaps, propsOf } = deps;

  const actions = hrefActions(cached, index, document, range, rangeOf, overlaps);

  const emit = (fix: Fix): void => {
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
  };

  for (const diagnostic of diagnostics) {
    const repair = REPAIRS.get(diagnostic.code);
    if (repair === undefined) continue;
    if (!overlaps(rangeOf(document, diagnostic.span), range)) continue;

    for (const fix of repair({ cached, index, document, diagnostic })) emit(fix);
  }

  for (const issue of contractIssues(cached, index)) {
    if (!overlaps(rangeOf(document, issue.at), range)) continue;
    for (const fix of contractFixes(issue, propsOf)) emit(fix);
  }

  return actions;
}

/** Which diagnostic codes have a bulb today. Read by the test that guards the table. */
export const REPAIRED_CODES: readonly string[] = [...REPAIRS.keys()];
