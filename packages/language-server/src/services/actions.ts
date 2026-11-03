/**
 * The light bulb (SDD-36 §3.1, §4.1).
 *
 * Every action here is anchored on a DIAGNOSTIC, never on the position of the cursor. The
 * difference is what keeps the bulb honest: "quote the value" appears where the compiler says
 * the value is unquoted and nowhere else, so a bulb that shows up is always a bulb with
 * something to fix. One that appears over healthy code trains the developer to ignore it.
 *
 * The repairs of a `.fud` diagnostic are `repairsFor`'s, which needs no editor; this module
 * turns each one into a code action. What stays here hangs on something that is not a `FUD`
 * code: the contract facts TypeScript reports, the cursor of the `control` action, and the
 * `href` that creates a file.
 *
 * Every action carries its `WorkspaceEdit` whole: no `command`, no `resolve`. An action that
 * has to be resolved is an action that can fail after the user accepted it, and the failure
 * lands in the document.
 */

import type { CodeAction, CreateFile, Position, Range, TextDocumentEdit } from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { CONTROL_NAME, span, type Diagnostic, type Span } from '@fudic/compiler';
import type { FudCode, SourceDiagnostic } from '@fudic/diagnostics';
import { explanationFile } from '@fudic/diagnostics/explain';
import { URI } from 'vscode-uri';
import type { CachedDocument } from '../document-cache.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { repairsFor } from '../repairs.js';
import { contractIssues, type ContractIssue, type MissingInContract } from './contract.js';
import type { ApiFiles } from './href.js';
import type { PropDetail, PropHolds } from './tag-card.js';
import { unresolvedHrefs } from '@fudic/typecheck';
import { accepts, boundPaths, controlBindingSites, type NodeKind } from './forms.js';

/** One replacement of a stretch of the `.fud` being edited. */
interface Edit {
  readonly span: Span;
  readonly newText: string;
}

/** A quick fix over the file being edited: a title and its edits, and nothing else. */
interface Fix {
  readonly title: string;
  readonly edits: readonly Edit[];
}

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
function contractFixes(issue: Exclude<ContractIssue, MissingInContract>, propsOf: PropLookup): readonly Fix[] {
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
        title: `Add the required props of <${issue.tag}>`,
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
        title: `Change to .${issue.suggestion}`,
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
        title: `Remove slot="${issue.written}"`,
        edits: [{ span: issue.attribute, newText: '' }],
      },
    ];
  }
  return issue.declared.map((name) => ({
    title: `Change to slot="${name}"`,
    edits: [{ span: issue.at, newText: name }],
  }));
}

/**
 * *«Add the layout's required props»* (SDD-40 §3.5, SDD-60 §4.7): `layout` written at the
 * end of the route's sibling `.fudapi` — created first when there is none — and the
 * `<link rel="server">` that makes it the route's, when the route does not link it yet. Its handler and the props it
 * returns are the author's, in `src/server`, where TypeScript asks for each one.
 *
 * Two files, so a `documentChanges` edit and no `Fix`. Each part only when it is missing: a
 * repair that wrote a second `layout` would trade this fact for `FUD1082`.
 */
function layoutContractAction(
  issue: MissingInContract,
  document: TextDocument,
  rangeOf: (document: TextDocument, at: Span) => Range,
): CodeAction {
  const { contract } = issue;
  const uri = URI.file(contract.path).toString();
  const changes: (CreateFile | TextDocumentEdit)[] = [];
  if (!contract.declared) {
    if (contract.text === undefined) changes.push({ kind: 'create', uri, options: { ignoreIfExists: true } });
    const text = contract.text ?? '';
    const end = endOf(text);
    // One blank line between declarations, as `formatApi` leaves them.
    const lead = text === '' ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    changes.push({ textDocument: { uri, version: null }, edits: [{ range: { start: end, end }, newText: `${lead}layout\n` }] });
  }
  if (!contract.linked) {
    changes.push({
      textDocument: { uri: document.uri, version: document.version },
      edits: [
        {
          range: rangeOf(document, span(issue.insertAt, issue.insertAt)),
          newText: `\n<link rel="server" href="${contract.href}">`,
        },
      ],
    });
  }
  return {
    title: "Add the layout's required props",
    kind: 'quickfix',
    diagnostics: [],
    edit: { documentChanges: changes },
  };
}

/** The layout repair, which writes the route's `.fudapi` and is no edit of this file alone. */
function writesContract(issue: ContractIssue): issue is MissingInContract {
  return issue.kind === 'missing-layout-props';
}

/** The position just past the last character of a text, whatever its line breaks. */
function endOf(text: string): Position {
  const lines = text.split(/\r\n|\r|\n/u);
  return { line: lines.length - 1, character: (lines[lines.length - 1] as string).length };
}

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

/**
 * `control="@userForm.alias"` on an element of a form that has none yet (SDD-34 §4.1).
 *
 * The one action here that is anchored on the CURSOR rather than on a diagnostic, and it earns
 * the exception the same way the rule does: a bulb that opens onto nothing is what trains a
 * developer to ignore the bulb. This one never can. It appears only where the attribute is
 * LEGAL — `controlBindingSites` is `control-inside-form` read forwards, so the three cases are
 * the compiler's own — only where the element does not already name a node, and only when there
 * is a node in the model that FITS: a `<form>` takes the form, an `<input>` a leaf, a `<div>` a
 * group (decision 109). Where any of those is missing there is no action at all, which is why
 * healthy markup outside a form shows nothing.
 *
 * It is not a diagnostic because it must not be one. An unbound `<input>` inside a form is
 * legal — a label, a button and a hint all live there — so a warning would be wrong about the
 * language. What is true is narrower and is exactly what a bulb says: here is a field of this
 * form that nothing has bound yet.
 *
 * The paths already written are dropped, in BOTH spellings (`boundPaths`): a field bound three
 * lines up is not a repair, it is a duplicate.
 */
function controlFixes(
  cached: CachedDocument,
  forms: FormNodes,
  within: (at: Span) => boolean,
): Fix[] {
  const taken = boundPaths(cached.document, cached.source);
  const fixes: Fix[] = [];

  for (const site of controlBindingSites(cached.document, cached.source)) {
    if (!within(site.element.openSpan)) continue;

    // With a form above, the candidates are ITS fields, reached through the very expression the
    // author wrote on it — so the path the action writes is the path they would have written.
    // With none, the element IS the `<form>` (or a control-component's own template), and the
    // candidates are the nodes the file's `@code` declares.
    const owner = site.owner;
    const candidates =
      owner === undefined
        ? [...forms.inScope()].map(([name, kind]) => ({ path: `${EXPRESSION_PREFIX}${name}`, kind }))
        : [...forms.fieldsAt(owner.at)].map(([name, kind]) => ({
            path: `${owner.path}.${name}`,
            kind,
          }));

    for (const candidate of candidates) {
      if (!accepts(site.wants, candidate.kind) || taken.has(candidate.path)) continue;
      fixes.push({
        title: `Bind ${CONTROL_NAME}=${candidate.path}`,
        edits: [
          {
            span: span(site.insertAt, site.insertAt),
            newText: ` ${CONTROL_NAME}=${candidate.path}`,
          },
        ],
      });
    }
  }
  return fixes;
}

/** What opens an expression, and therefore how a node is named. */
const EXPRESSION_PREFIX = '@';

/**
 * Reading the model behind a `control`, injected rather than reached for.
 *
 * The same arrangement `propsOf` has and for its reason: what this module needs is «which names
 * are nodes and of what kind», which is a question, not a program. TypeScript stays on the
 * other side of it.
 */
export interface FormNodes {
  /** The nodes the file's `@code` declares, by name. */
  inScope(): ReadonlyMap<string, NodeKind>;
  /** The fields of the node named at this `.fud` offset. Empty when it names none. */
  fieldsAt(at: number): ReadonlyMap<string, NodeKind>;
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
  /**
   * The model behind a `control`, for the one action that is anchored on the cursor.
   *
   * Injected like `propsOf` and for its reason: which names hold a form node is a question only
   * the checker can answer, and this module holds no TypeScript.
   */
  readonly formNodes: FormNodes;
  /** The `.fudapi` of the app, which the layout repair writes. */
  readonly apis?: ApiFiles;
  /** The project's TypeScript, which the loop-key repair asks for an element's type. */
  readonly typescript?: ts.LanguageService;
}

/** The client command that opens an explanation in the markdown preview (`fudic-vscode`). */
export const EXPLAIN_COMMAND = 'fudic.explain';

/**
 * "Explain FUDnnnn": opens the code's `.md`. Where it is on disk is `@fudic/diagnostics`'
 * answer — its own `src/codes/` in the workspace, `codes/` beside the bundled server in the
 * `.vsix`, where the extension's build copies them.
 */
export function explainAction(code: FudCode): CodeAction {
  const title = `Explain ${code}`;
  return {
    title,
    kind: 'quickfix',
    command: { title, command: EXPLAIN_COMMAND, arguments: [explanationFile(code)] },
  };
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

  const explained = new Set<FudCode>();
  for (const diagnostic of diagnostics) {
    if (!overlaps(rangeOf(document, diagnostic.span), range)) continue;

    // Every repair of the table edits the file it was asked about, so its edits go to Volar's
    // uri for it, which Volar maps back to the `.fud`.
    const input = { cached, index, ...(deps.typescript === undefined ? {} : { typescript: deps.typescript }) };
    for (const repair of repairsFor(input, diagnostic)) emit(repair);

    // Every code also explains itself, once per code however many times it fires here. A
    // `command` and not an edit, which the header rules out for repairs: this one edits nothing,
    // and its argument is a path on disk, not a document uri Volar would have to rewrite.
    if (explained.has(diagnostic.code)) continue;
    explained.add(diagnostic.code);
    actions.push(explainAction(diagnostic.code));
  }

  for (const issue of contractIssues(cached, index, deps.apis)) {
    if (!overlaps(rangeOf(document, issue.at), range)) continue;
    if (writesContract(issue)) {
      actions.push(layoutContractAction(issue, document, rangeOf));
      continue;
    }
    for (const fix of contractFixes(issue, propsOf)) emit(fix);
  }

  for (const fix of controlFixes(cached, deps.formNodes, (at) =>
    overlaps(rangeOf(document, at), range),
  )) {
    emit(fix);
  }

  return actions;
}

/**
 * "Explain FUDnnnn" for each code of `diagnostics` whose span meets `[start, end]`, once per code:
 * what a `.fudapi` and a `.fudspec` offer, as a `.fud` does (SDD-75).
 */
export function explainActions(diagnostics: readonly SourceDiagnostic[], start: number, end: number): CodeAction[] {
  const codes = diagnostics.filter((d) => d.span.start <= end && start <= d.span.end).map((d) => d.code);
  return [...new Set(codes)].map(explainAction);
}
