/**
 * The server's own Volar service (SDD-24 §4.2–§4.4).
 *
 * Everything here answers over the `.fud` itself, never over an embedded document: these are the
 * features whose knowledge is this package's — what a `<link>` means, which tags are in scope,
 * what the layout declares, and the two rules of §4.4. Types, HTML and CSS are answered by their
 * own services, through the mapping.
 *
 * Every handler goes through `RequestStats.run`, which asks the cancellation token before doing
 * any work. That is the invariant of §5 made mechanical rather than remembered.
 */

import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
} from 'vscode-languageserver-protocol';
import type {
  CodeAction,
  CompletionItem,
  CompletionList,
  Diagnostic as LspDiagnostic,
  DocumentLink,
  LanguageServiceContext,
  LanguageServicePlugin,
  Range,
  SemanticToken,
} from '@volar/language-service';
import {
  CLASS_PREFIX,
  CONTROL_NAME,
  CONTROL_PROP,
  regionAt,
  span,
  type Diagnostic,
  type ElementNode,
  type Severity,
  type Span,
} from '@fudic/compiler';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { COMPLETION_TRIGGER_CHARACTERS, SEMANTIC_TOKENS_LEGEND } from '../capabilities.js';
import type { CachedDocument } from '../document-cache.js';
import { ROOT_CODE_ID, type FudicVirtualCode } from '../virtual-code.js';
import { isFudSourceUri } from '../uri.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { RequestStats } from '../stats.js';
import { reindentLine } from '@fudic/formatter';
import { fudicDiagnostics } from './compiler-diagnostics.js';
import { emmetCompletions } from './emmet.js';
import { formattedText } from './formatting.js';
import { hrefCompletions } from './href.js';
import { codeActions } from './actions.js';
import {
  attributeValueBindingAt,
  brokenValueContextAt,
  classContextAt,
  delegateContextAt,
  classValueContextAt,
  controlNameAt,
  controlValueAt,
  directiveContextAt,
  expressionValueContextAt,
  handlerContextAt,
  hrefContextAt,
  valueBegun,
  nativeGapContextAt,
  ownedByProjection,
  sectionContextAt,
  tagContextAt,
  wordContextAt,
  type PartialName,
} from './position.js';
import {
  controlOfferAt,
  controlWants,
  nodeMembersAt,
  nodesInScope,
  projectedOffset,
  reaches,
  type ControlOffer,
} from './forms.js';
import { typeScriptService } from './ts-service.js';
import { interpolates, scopeNames, templateScope } from './template-scope.js';
import { styleClassNames } from './classes.js';
import { delegateNames } from './delegate.js';
import { sectionCompletions } from './sections.js';
import { scopeAt, snippetsAt } from './snippets.js';
import {
  componentTags,
  documentLinks,
  linkInsertionFor,
  tagDefinitionAt,
  type TagCompletion,
} from './tags.js';
import { semanticTokens } from './semantic-tokens.js';
import { cardMarkdown, propDetails, tagCardAt } from './tag-card.js';

/** What opens an expression, and therefore what every name in scope is written with. */
const EXPRESSION_PREFIX = '@';

/** What the service needs from the server around it. */
export interface FudicServiceContext {
  readonly index: WorkspaceIndex;
  readonly stats: RequestStats;
  /**
   * Whether a TypeScript service is mounted alongside this one.
   *
   * It decides ONE thing: who answers at a binding value and at a `@` in markup. Both lists
   * are the template's scope, and both this service and the decorator over TypeScript can
   * produce it — so with TypeScript mounted this one must stay quiet or the developer sees
   * every name twice. Volar cannot arbitrate it: the mappings there are `isAdditional`, so
   * nothing claims the position and every plugin is asked.
   *
   * Absent means mounted, which is the safe default — the duplicate is the visible failure.
   */
  readonly typescript?: boolean;
}

const SEVERITY: Readonly<Record<Severity, DiagnosticSeverity>> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/** A `.fud` span as an LSP range. */
export function rangeOf(document: TextDocument, span: Span): Range {
  return { start: document.positionAt(span.start), end: document.positionAt(span.end) };
}

/** A compiler diagnostic as an LSP one. Same span, same code: nothing is translated. */
export function toLspDiagnostic(document: TextDocument, diagnostic: Diagnostic): LspDiagnostic {
  return {
    range: rangeOf(document, diagnostic.span),
    severity: SEVERITY[diagnostic.severity],
    code: diagnostic.code,
    source: 'fudic',
    message: diagnostic.message,
  };
}

/**
 * The parse behind a document, or `undefined` when this document is not ours.
 *
 * The `CachedDocument` travels attached to the root virtual code, so asking for it costs nothing
 * and cannot disagree with what TypeScript was shown.
 *
 * The URI needs decoding first: Volar hands even the ROOT code over as an embedded document —
 * `volar-embedded-content://root/<encoded source uri>` — because the root is a virtual code like
 * any other. Its text and offsets are the source's, one to one, so once the real URI is
 * recovered everything downstream works in `.fud` coordinates.
 *
 * "Ours" is decided by the URI and the code id, never by `languageId`. Formatting and on-type
 * formatting are handed the SOURCE document, whose id is whatever the editor registered `.fud`
 * under — `fudic` in VS Code (SDD-25 §3.1), not the `fud` this server uses internally. Comparing
 * the two names silently hands `.fud` files to Volar's built-in TypeScript formatter, which is a
 * different formatter with different output: the same file then comes out of the editor and out
 * of `fudic format` with different quotes.
 *
 * The other embedded codes are excluded by id, for the same reason in reverse: the client and
 * server projections decode back to this very `.fud`, so a URI check alone accepts them — and
 * then every diagnostic of ours is reported twice, the second time on whatever span the
 * projection's own mapping table happens to point at.
 */
export function fudicDocumentOf(
  context: LanguageServiceContext,
  document: TextDocument,
): CachedDocument | undefined {
  const uri = URI.parse(document.uri);
  const decoded = context.decodeEmbeddedDocumentUri(uri);
  if (decoded !== undefined && decoded[1] !== ROOT_CODE_ID) return undefined;

  const source = decoded?.[0] ?? uri;
  if (!isFudSourceUri(source)) return undefined;

  const root = context.language.scripts.get(source)?.generated?.root as
    | FudicVirtualCode
    | undefined;
  return root?.document;
}

/** Whether two ranges of the same document overlap at all. */
function overlaps(a: Range, b: Range): boolean {
  const before = a.end.line < b.start.line ||
    (a.end.line === b.start.line && a.end.character < b.start.character);
  const after = b.end.line < a.start.line ||
    (b.end.line === a.start.line && b.end.character < a.start.character);
  return !before && !after;
}

/**
 * The tag after a `<`, as a plugin of its own (BUG-15 §4.6).
 *
 * A second plugin for one branch looks like too much until you see what decides the question in
 * Volar. The first plugin that returns non-empty items with a completion capability that is not
 * ADDITIONAL sets `mainCompletionUri`, and from then on every non-additional plugin over the
 * same document is skipped. That flag is a property of the PLUGIN, never of the position — so
 * one plugin cannot shadow Emmet inside an `href` and step aside inside a `<` at the same time.
 * Removing the early `return` from the tag branch changes nothing at all: measured, `<di` still
 * came back with the two workspace components and not one native tag.
 *
 * So the branch that has to merge moves to a plugin that is additional, and the ones that have
 * to answer alone stay in the one that is not. What that buys is the list a `.html` gives:
 * `app-badge` sorted ahead by its `sortText` (§6.4 of SDD-24), and behind it the hundred and
 * fifty native tags the HTML service owns. The server knows things the HTML service does not,
 * and not one of them is a reason to cover up the things it does.
 *
 * `href`, `@section ` and `class:` are untouched by this and stay exclusive: there a reply from
 * HTML is not one more voice, it is noise over a position whose answers are closed and local.
 *
 * The directive was to join it with BUG-23 §2.5 and does NOT: moving the branch here is not
 * enough, and the reason is a rule of Volar the BUG did not have in front of it. An additional
 * plugin only runs on the FIRST mapping of a request (`isFirstMapping`), and the embedded codes
 * are walked before the root — so as soon as the position also maps into the projection, which
 * is exactly what `@fore` does, this plugin is skipped and its snippets never reach the list.
 * The branch stays in `createFudicService` until that is decided; see the BUG's task 13.
 */
export function createFudicTagService(deps: FudicServiceContext): LanguageServicePlugin {
  const { index, stats } = deps;

  return {
    name: 'fudic-tags',
    capabilities: {
      completionProvider: { triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS] },
    },
    create(context) {
      return {
        // The whole reason this plugin exists, and it goes on the INSTANCE: Volar reads the
        // flag off what `create()` returns, never off the plugin around it. It also sorts this
        // one last, which is where a voice that adds to another one belongs.
        isAdditionalCompletion: true,

        provideCompletionItems(document, position, _completionContext, token) {
          return stats.run(
            'tagCompletion',
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              const offset = document.offsetAt(position);
              const tag = tagContextAt(cached.source, offset);
              if (tag !== undefined) {
                // The `<` is already written, so the tag name completes into what follows it.
                return list(
                  tagItems(cached, index, document, tag, (name, body) => `${name}${body}`),
                );
              }

              const region = regionAt(cached.source, cached.html, offset);

              // `.name=.` is `FUD0056`, and this plugin is ADDITIONAL — nothing silences it for
              // us, so it declines the position itself.
              if (brokenValueContextAt(cached.source, offset, region)) return undefined;

              // An empty position inside a NATIVE start tag: `<div |>`, `<div cla|>`.
              //
              // `class:red` is the grammar's, not a component's (decision 28), and a `<div>` was
              // the one place it could not be reached by asking: the list there is the HTML
              // service's, which has never heard of it. On a component the very same binding
              // arrives with `$gap`, so the two tags answered differently for no reason the
              // author could learn.
              //
              // Here, and not in `createFudicService`, for the reason the tag branch is here:
              // it has to MERGE. HTML's 151 attributes are right and stay; these go in front of
              // them, sorted `0_`.
              const native = nativeGapContextAt(cached.source, offset, region);
              if (native !== undefined) {
                const items = [
                  // `control` before the classes: inside a form it is the reason the tag is
                  // being written at all, and the classes of the file are always there.
                  ...controlItems(
                    controlOfferAt(cached, native.element, false),
                    document,
                    native.name,
                  ),
                  ...classBindingItems(cached, document, native.name),
                ];
                return items.length === 0 ? undefined : list(items);
              }

              // Inside an attribute's value, with no `@` opened: the names the template can see,
              // each one writing the `@` that reaches them.
              //
              // Here rather than in `createFudicService` because this one has to MERGE. A value
              // is HTML's too — `role` has an enumeration, `href` has paths — and replacing that
              // list with ours would be trading one half of the answer for the other. The same
              // reason the tag branch lives here.
              //
              // And it works precisely because nothing else claims the position: an additional
              // plugin runs on the FIRST mapping alone, and a value with no `@` in it is
              // projected as a literal, which carries no completion. The moment a `@` is typed
              // there IS a projection to ask, this plugin is skipped, and the answer comes from
              // `ts-completion.ts` — the same names, with the types behind them.
              const binding = attributeValueBindingAt(cached.source, offset, region);
              if (binding === undefined) return undefined;

              // The `href` of a `<link>` is not a value, it is a PATH the build resolves: an
              // interpolation there cannot be followed to a file, and decision 81 says as much
              // for the layout. Its list is exact and closed — the `.fud` files of the project
              // — and putting the template's names beside them offers a way to write something
              // that will never resolve.
              if (hrefContextAt(cached.source, cached.document, offset) !== undefined) {
                return undefined;
              }

              // Begun by hand, so the value is the author's and no name can finish it: the same
              // rule the projection's side applies, and for the same reason — a list left open
              // over a written value turns every Tab into an accept.
              if (valueBegun(binding.text)) return undefined;

              // `control=|`, before the `@` is there. The value is a form NODE and not any
              // expression, so the whole scope is the wrong list here exactly as it is one
              // character later — where `ts-completion.ts` narrows it against the checker.
              //
              // The names come from the MODULE scope of the projection rather than from the
              // caret, and that is the one thing this position cannot have: nothing is projected
              // at a value the grammar could not read, so there is no offset to ask at. What it
              // costs is a form pulled out of a `@foreach`, which is in scope at the caret and
              // in no module; what it buys is that the position answers at all. The moment the
              // `@` lands the exact list takes over.
              const controlOn = controlValueAt(cached.source, offset, region);
              if (controlOn !== undefined) {
                return controlNodeList(
                  typeScriptService(context),
                  cached,
                  controlOn,
                  document,
                  binding,
                );
              }

              const items = scopeItems(cached, document, binding, false, false);
              // Incomplete: the next character decides between these names and silence.
              return items.length === 0 ? undefined : list(items, true);
            },
            undefined,
          );
        },
      };
    },
  };
}

/** The service. */
export function createFudicService(deps: FudicServiceContext): LanguageServicePlugin {
  const { index, stats } = deps;
  // Mounted unless the server says otherwise; see `FudicServiceContext.typescript`.
  const alone = deps.typescript === false;

  return {
    name: 'fudic',
    capabilities: {
      // The trigger characters of §3.2 that this service is the one to answer: `"` and `/` inside
      // an href, `<` for a tag, and the space after `@section`. Plus Emmet's, which are what
      // keep the editor asking while an abbreviation grows.
      completionProvider: { triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS] },
      documentLinkProvider: { resolveProvider: false },
      // Only the tag: everything inside it is answered by TypeScript over the projection.
      definitionProvider: true,
      // Same boundary, for the same reason: a component's contract is knowledge this package
      // has and TypeScript does not — the tag is projected as a type name nobody can hover.
      hoverProvider: true,
      semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND },
      diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
      codeActionProvider: {},
      // Declared here at last: SDD-24 §3.2 announced formatting to the client from the first
      // commit and answered empty, so that nothing had to be reconfigured when SDD-26 landed.
      documentFormattingProvider: true,
      // `}` and `>` are the two characters of §4.7, and the only two.
      documentOnTypeFormattingProvider: { triggerCharacters: ['}', '>'] },
    },

    create(context) {
      return {
        provideCompletionItems(document, position, _completionContext, token) {
          return stats.run(
            'completion',
            token,
            () => completions(context, document, position, index, alone),
            undefined,
          );
        },

        provideDefinition(document, position, token) {
          return stats.run(
            'definition',
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              const found = tagDefinitionAt(cached, index, document.offsetAt(position));
              if (found === undefined) return undefined;

              // The top of the file: a component's identity is the whole file, and the index
              // holds its role and its tag, not the span of its root element. Opening it where
              // it starts is the honest answer, and it costs no second parse.
              const top: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
              return [
                {
                  targetUri: URI.file(found.target).toString(),
                  targetRange: top,
                  targetSelectionRange: top,
                  originSelectionRange: rangeOf(document, found.span),
                },
              ];
            },
            undefined,
          );
        },

        provideDocumentFormattingEdits(document, range, options, _embedded, token) {
          return stats.run(
            'formatting',
            token,
            async () => {
              if (fudicDocumentOf(context, document) === undefined) return undefined;

              const source = document.getText();
              const selection: Span = {
                start: document.offsetAt(range.start),
                end: document.offsetAt(range.end),
              };
              // A selection that covers the file IS the file: `formatRange` would splice a
              // node back in and skip the single terminating newline the whole-file path adds.
              const whole = selection.start === 0 && selection.end === source.length;
              const text = await formattedText(
                source,
                { tabSize: options.tabSize, insertSpaces: options.insertSpaces },
                whole ? undefined : selection,
              );
              // An EMPTY list, not `undefined`, when there is nothing to do. Volar walks the
              // services in order and moves to the next one on a nullish answer — so a `.fud`
              // that is already formatted, or that does not parse, would be handed to the HTML
              // service, which has its own idea of layout and no idea of `@if`. Answering
              // "nothing to change" is what stops the walk.
              if (text === undefined) return [];

              // One edit over the whole document. The formatter returns a document, not a
              // diff, and inventing a minimal diff here would be a second layout algorithm.
              return [{ range: rangeOf(document, { start: 0, end: source.length }), newText: text }];
            },
            undefined,
          );
        },

        provideOnTypeFormattingEdits(document, position, _key, _options, _embedded, token) {
          return stats.run(
            'onTypeFormatting',
            token,
            () => {
              if (fudicDocumentOf(context, document) === undefined) return undefined;

              const edit = reindentLine(document.getText(), document.offsetAt(position));
              // Empty rather than nullish, for the same reason as above.
              if (edit === undefined) return [];
              return [{ range: rangeOf(document, edit.span), newText: edit.text }];
            },
            undefined,
          );
        },

        provideDocumentLinks(document, token) {
          return stats.run(
            'documentLinks',
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              return documentLinks(cached, index).map(
                (link): DocumentLink => ({
                  range: rangeOf(document, link.span),
                  target: URI.file(link.target).toString(),
                }),
              );
            },
            undefined,
          );
        },

        provideDiagnostics(document, token) {
          return stats.run(
            'diagnostics',
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              return fudicDiagnostics(cached, index).map((diagnostic) =>
                toLspDiagnostic(document, diagnostic),
              );
            },
            undefined,
          );
        },

        provideDocumentSemanticTokens(document, _range, legend, token) {
          return stats.run(
            'semanticTokens',
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              return semanticTokens(cached).map((item): SemanticToken => {
                const start = document.positionAt(item.span.start);
                return [
                  start.line,
                  start.character,
                  item.span.end - item.span.start,
                  legend.tokenTypes.indexOf(item.type),
                  0,
                ];
              });
            },
            undefined,
          );
        },

        provideHover(document, position, token) {
          return stats.run(
            'hover',
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              const offset = document.offsetAt(position);

              // The `control` attribute NAME, which no other voice can explain: it is not
              // HTML's, so the HTML service has never heard of it, and it is not a prop, so the
              // projection has no member to hover. What it says is the one thing the author
              // cannot read off the tag — WHICH of the three kinds this element takes.
              const control = controlNameAt(cached.source, offset, regionAt(cached.source, cached.html, offset));
              if (control !== undefined) {
                const wants = controlWants(control.element, control.element.name.includes('-'));
                if (wants !== undefined) {
                  return {
                    contents: { kind: 'markdown' as const, value: controlHover(wants) },
                    range: rangeOf(document, control.span),
                  };
                }
              }

              const card = tagCardAt(cached, index, offset);
              if (card === undefined) return undefined;

              // The second half, and the only one that may not arrive: it comes from the
              // projection of the file the card is ABOUT, which is a different file from the
              // one being hovered. The card is complete without it (SDD-36 §4.4).
              return {
                contents: {
                  kind: 'markdown',
                  value: cardMarkdown(card, propDetails(typeScriptService(context), card.file)),
                },
                range: rangeOf(document, card.span),
              };
            },
            undefined,
          );
        },

        provideCodeActions(document, range, _codeActionContext, token) {
          return stats.run(
            'codeActions',
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              // The server's OWN diagnostics, not the ones the client sent in the context: a
              // client sends what it last rendered, and a repair computed against a stale span
              // edits the wrong stretch. Recomputing is free — the parse and the Oxc batch are
              // the cache's.
              return codeActions({
                cached,
                index,
                document,
                range,
                diagnostics: fudicDiagnostics(cached, index),
                rangeOf,
                overlaps,
                // The same reader the card uses, for the same reason: what a prop TAKES is not
                // in the index, and a repair that writes `.id=""` into a `number` is a repair
                // that leaves an error behind (decision 19).
                propsOf: (file) => propDetails(typeScriptService(context), file),
                // The two readings the `control` bulb needs, both over the client projection —
                // the module scope for the nodes a file declares, and the type of one written
                // expression for its fields. `projectedOffset` is what carries a `.fud` offset
                // across; an offset the projection never copied simply has no fields, which is
                // the same silence every other degradation here produces.
                formNodes: {
                  inScope: () => nodesInScope(typeScriptService(context), cached.path, 0),
                  fieldsAt: (at) =>
                    nodeMembersAt(
                      typeScriptService(context),
                      cached.path,
                      projectedOffset(cached, at),
                    ),
                },
              });
            },
            undefined,
          );
        },
      };
    },
  };
}

/**
 * The completions the server owns, in the order they can apply (SDD-24 §4.2, SDD-28 §5.5).
 *
 * The contexts here are EXACT — inside an `href`, after `@section `, after `class:` — and each
 * answers alone: in those positions a word cannot mean anything else, so shadowing Emmet is
 * the right thing to do. The tag after a `<` is deliberately NOT one of them; see
 * `createFudicTagService`.
 *
 * The last one is not exact. A bare word in markup may be a component tag, a snippet, or an
 * Emmet abbreviation, and there is no way to tell which from the text. So it MERGES: our items
 * are added to Emmet's rather than replacing them. Returning early there would silently kill
 * every abbreviation the user has ever typed — `div`, `ul>li*3` — which is the regression
 * SDD-28 §5.3 exists to prevent.
 */
function completions(
  context: LanguageServiceContext,
  document: TextDocument,
  position: { line: number; character: number },
  index: WorkspaceIndex,
  alone: boolean,
): CompletionList | undefined {
  const cached = fudicDocumentOf(context, document);
  if (cached === undefined) return undefined;

  const offset = document.offsetAt(position);
  // Asked once and handed to every context below: one traversal per completion request, and
  // one answer, so two contexts can never disagree about where the cursor is (BUG-22).
  const region = regionAt(cached.source, cached.html, offset);

  const href = hrefContextAt(cached.source, cached.document, offset);
  if (href !== undefined) {
    return list(
      hrefCompletions(cached, index, href).map((item) => ({
        label: item.href,
        kind: CompletionItemKind.File,
        detail: item.tag === '' ? item.role : `${item.role} · <${item.tag}>`,
        textEdit: { range: rangeOf(document, href.value), newText: item.href },
      })),
    );
  }

  const section = sectionContextAt(cached.source, offset);
  if (section !== undefined) {
    return list(
      sectionCompletions(cached, index).map((name) => ({
        label: name,
        kind: CompletionItemKind.EnumMember,
        detail: 'section of the layout',
        textEdit: { range: rangeOf(document, section.span), newText: name },
      })),
    );
  }

  // Exact too: after those two colons a word can be neither an Emmet abbreviation nor a tag.
  // With the condition the `@` branch already uses — a file with no `<style>` has nothing to
  // say, and an empty list would silence Emmet without putting anything in its place (§4.3).
  const classes = classContextAt(cached.source, offset, region);
  if (classes !== undefined) {
    const items = styleClassNames(cached).map(
      (name): CompletionItem => ({
        label: name,
        // The same kind the gap list gives them: one thing, one icon, wherever it is asked for.
        kind: CompletionItemKind.EnumMember,
        detail: 'class of this file',
        // `=@` and ask again, the same as the gap list: one thing, one behaviour, wherever it is
        // asked for. Only the name is replaced here — the `class:` is already in the source.
        textEdit: { range: rangeOf(document, classes.span), newText: `${name}=@` },
        command: { title: 'Suggest', command: 'editor.action.triggerSuggest' },
      }),
    );
    if (items.length > 0) return list(items);
  }

  // Exact for the same reason `class:` is: after that colon a word is the name of a loop
  // binding and can be nothing else. What it offers is the header of the loop the attribute
  // sits in — which is what turns `FUD0662` from an error into a typo that never happened.
  //
  // No `=@` and no second list, unlike `class:red`: a marker takes no value (decision 116),
  // so the name is the whole of what the author has left to write.
  const delegate = delegateContextAt(cached.source, offset, region);
  if (delegate !== undefined) {
    const items = delegateNames(cached, offset).map(
      (name): CompletionItem => ({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: 'binding of the loop',
        textEdit: { range: rangeOf(document, delegate.span), newText: name },
      }),
    );
    if (items.length > 0) return list(items);
  }

  // Inside the value of a plain `class`: the same names, at the other place the grammar spells a
  // class. Exact like the two above — inside those quotes a word is a class name and can be
  // nothing else — and with their same condition: a file with no `<style>` has nothing to say,
  // and an empty list would silence Emmet without putting anything in its place (§4.3).
  //
  // The value is a LIST, so only the word under the cursor is replaced and `class="red ye|"`
  // keeps its `red`. And no `=@` and no second list here, unlike `class:red`: this attribute
  // takes literal names, not an expression.
  const classValue = classValueContextAt(cached.source, offset, region);
  if (classValue !== undefined) {
    const items = styleClassNames(cached).map(
      (name): CompletionItem => ({
        label: name,
        kind: CompletionItemKind.EnumMember,
        detail: 'class of this file',
        textEdit: { range: rangeOf(document, classValue.span), newText: name },
      }),
    );
    if (items.length > 0) return list(items);
  }

  // The closed positions of the grammar: the ones this server answers by saying NOTHING.
  //
  // A property after `.`, an event after `@`, a member after a `.` in an expression, and the
  // value of a binding opened with `@`. Every one of those lists belongs to TypeScript over the
  // projection — the component's contract, the DOM's event map, the members of `data`, the
  // names in the template's scope. What the server has to do there is get out of the way: no
  // Emmet, no tags, no snippets. Returning `undefined` is exactly that.
  //
  // Not returning it is what made `@data.` offer nothing: the position fell all the way to
  // `return emmet` at the bottom of this function, and a non-empty reply from the root CLAIMS
  // the position in Volar, so the projection was never asked.
  //
  // The `@()` snippet that belongs at a binding value is contributed from
  // `createFudicTagService`, which is additional — it adds a voice there instead of taking the
  // position away from TypeScript.
  //
  // With ONE exception, and it is the lesson of the editor disagreeing with the suite. At a
  // binding value the list is the template's SCOPE, and this server computes that scope from
  // the parse — no TypeScript program is involved. So when the walk reaches the root here it
  // means TypeScript did not answer, and "get out of the way" is the wrong move: there is
  // nobody left to get out of the way FOR. The names are offered from here instead, and they
  // are the same names, because both callers ask `templateScope`.
  const value = alone ? expressionValueContextAt(cached.source, offset, region) : undefined;
  if (value !== undefined) {
    const callableOnly = handlerContextAt(cached.source, offset, region) !== undefined;
    // Incomplete: the next character decides between these names and silence, and a complete
    // list is one VS Code never asks about again. See `list`.
    return list(scopeItems(cached, document, value, callableOnly), true);
  }
  if (ownedByProjection(cached.source, offset, region)) return undefined;

  // The tag after a `<` is NOT here: it merges instead of claiming, and in Volar that is a
  // property of a plugin rather than of a branch. It lives in `createFudicTagService`.

  // A `@` is unambiguous too, but it can come up empty — in an empty file nothing starts with
  // one — and an empty list would suppress what Emmet has to say. So it only wins when it has
  // something.
  const directive = directiveContextAt(cached.source, offset, region);
  if (directive !== undefined) {
    // The constructs a `@` may open, the names the template can see, and the way out to any
    // expression at all.
    //
    // Both halves are gated, and by the same fact: in MARKUP with TypeScript mounted, the
    // reply that carries them is TypeScript's — `ts-completion.ts` puts the scope, the `@()`
    // and the snippets in the one list Volar allows there. The root is reached ANYWAY, which
    // is what nobody had measured: at `@d|` the editor rendered `@if`, `@foreach` and the rest
    // twice over, once with the `@` inside the replaced range and once without. A voice that
    // repeats another is not a second answer.
    //
    // Outside markup it is the root's alone: inside a `<style>` a `@` opens `@media`, inside
    // `@code` it opens `@client`, and `ts-completion.ts` declines both — so offering `data` or
    // `@()` there would be wrong, and offering the block snippets is the only right answer.
    const scope = scopeAt(cached, directive.span.start);
    const inMarkup = scope === 'markup';
    const items = [
      ...(alone || !inMarkup
        ? snippetItems(cached, document, directive, (label) => label.startsWith('@'))
        : []),
      ...(alone && inMarkup ? scopeItems(cached, document, directive, false) : []),
    ];
    if (items.length > 0) return list(items);
  }

  const emmet = emmetCompletions(cached, document, position);
  const word = wordContextAt(cached.source, offset, region);

  // A plain Ctrl+Space in markup TEXT, with no `@` typed: the same list a `@` opens.
  //
  // The constructs (`@if`, `@foreach`), the names the template can see, and the way out to any
  // expression — all of them written WITH the `@`, since the author has not typed one. A
  // developer who does not yet know that a `@` is how fudic reaches its data cannot ask for the
  // list by typing the one character they are missing; this is the position where that gets
  // taught, and it costs the list nothing to be there.
  //
  // Not from TypeScript, and not a duplicate of the directive branch of `ts-completion.ts`
  // either: that one needs a `@` to fire, and plain text maps into no projection at all, so
  // nobody else is asked here.
  //
  // Never after a `<`, and that is BUG-15 §4.6 again: the tag list is the ADDITIONAL plugin's
  // so that the HTML service still gets to add the native elements, and an item from this one
  // sets Volar's `mainCompletionUri` and takes them off the screen. A `<` with nothing behind
  // it is markup like any other position, so only the context tells them apart.
  // And never where a `@` is already typed. That position is the directive branch's, and with
  // TypeScript mounted it defers — so answering from here is not a second answer, it is the
  // first one said twice: `@t` rendered `@title`, `@handlerClick`, `@data` and `@()` once from
  // TypeScript's reply and once again from this list.
  const text =
    region.kind === 'markup' &&
    directive === undefined &&
    scopeAt(cached, offset) === 'markup' &&
    tagContextAt(cached.source, offset) === undefined
      ? (word ?? { span: span(offset, offset), text: '' })
      : undefined;
  if (word === undefined && text === undefined) return emmet;

  const ours = [
    // The snippet scope, not the region: in a file that has nothing in it yet the region is
    // markup like any other, and there the only sensible list is the four skeletons.
    //
    // And never where a `@` is open. `@fore` is a construct being written, not a tag: with
    // TypeScript mounted the branch above declines it — the list is TypeScript's, and saying
    // it twice is what `alone` exists to prevent — and without this guard the position fell
    // through to here and was answered with the components of the workspace.
    ...(word !== undefined && directive === undefined && scopeAt(cached, offset) === 'markup'
      ? tagItems(cached, index, document, word, (name, body) => `<${name}${body}`)
      : []),
    ...(word === undefined
      ? []
      : snippetItems(cached, document, word, (label) => !label.startsWith('@'))),
    ...(text === undefined
      ? []
      : [
          // The bodies are stored with their `@`, and here that is exactly right: there is none
          // in the source to keep, so the snippet brings its own.
          ...snippetItems(cached, document, text, (label) => label.startsWith('@')),
          // Unconditionally, and not behind `alone` like the branches above: literal text is
          // projected NOWHERE — only an interpolation and a dangling `@` are — so TypeScript is
          // never asked at this offset and there is nobody to defer to.
          ...scopeItems(cached, document, text, false, false),
        ]),
  ];
  if (ours.length === 0) return emmet;

  // Ours first, and Emmet's kept whole: an abbreviation grows with characters no local filter
  // would keep, which is why `isIncomplete` has to survive the merge.
  return { isIncomplete: emmet?.isIncomplete ?? false, items: [...ours, ...(emmet?.items ?? [])] };
}

/**
 * Everything after the tag NAME when a tag is expanded: a tabstop per required prop, then
 * the one inside the element (BUG-23 §6, criterion 21.b).
 *
 *     <app-button .label="$1">$0</app-button>
 *
 * The optional props are deliberately not here. A component with a dozen of them would expand
 * into a dozen tabstops the author has to <kbd>Tab</kbd> past, which is worse than none — and
 * the `.` reaches every one of them, with its type, the moment they are wanted. Where the
 * required ones cannot be known — the component is not in the index, or its `props<T>()` names
 * a type instead of a literal — the list is empty and the expansion is the one from before:
 * degrading is offering LESS, never offering something invented.
 */
function tagBody(item: TagCompletion): string {
  // No quotes on any of them, whatever the prop's type. What follows a `.prop=` is whatever is
  // assignable to it — a bare scalar (decision 105), an `@` expression (103), a quoted string —
  // and choosing one of the three for the author is choosing wrong two times out of three:
  // `"$1"` around a `number` hands them a type error the moment they tab through it.
  const props = item.requiredProps.map((name, i) => ` .${name}=$${i + 1}`).join('');
  return `${props}>$0</${item.tag}>`;
}

/**
 * Open the list on the value the author has just been left standing on.
 *
 * Only on the FIRST prop of an expanded tag, and that limit is not an omission — it is what
 * VS Code allows. An open list focuses an item, and a focused item makes <kbd>Tab</kbd> an
 * accept rather than a jump to the next tabstop; the editor offers exactly one lever over
 * that, `editor.suggest.selectionMode`, and it is per LANGUAGE, so turning it off to protect
 * the Tab also unfocuses Emmet and every HTML list in the file. Neither half is worth the
 * other, so the list opens where the author is going to type anyway and nowhere else. On the
 * props after it, Ctrl+Space — or a `@`, which is a trigger character and opens it too.
 */
const SUGGEST = { title: 'Suggest', command: 'editor.action.triggerSuggest' };

/**
 * The component tags of this file as completion items.
 *
 * Two groups: the ones already linked, and the ones that exist in the workspace and are not.
 * Accepting one of the second kind carries its `<link>` in `additionalTextEdits`, so the tag
 * and the declaration that makes it legal land in the same keystroke (SDD-28 §5.3).
 */
function tagItems(
  cached: CachedDocument,
  index: WorkspaceIndex,
  document: TextDocument,
  context: PartialName,
  write: (tag: string, body: string) => string,
): readonly CompletionItem[] {
  return componentTags(cached, index).map((item): CompletionItem => {
    const insertion = item.linked ? undefined : linkInsertionFor(cached, item.href);
    return {
      label: item.tag,
      kind: CompletionItemKind.Class,
      detail: item.href,
      // Sorted ahead of the native tags the HTML service contributes, and labelled, so the
      // groups are told apart in the list (§6.4). The unlinked ones come after the linked
      // ones: they cost an edit the others do not.
      sortText: `${item.linked ? '0' : '1'}_${item.tag}`,
      labelDetails: { description: item.linked ? 'fudic component' : 'fudic component · adds <link>' },
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: { range: rangeOf(document, context.span), newText: write(item.tag, tagBody(item)) },
      // With props to fill, the cursor lands on the first `.prop=` and the list opens by
      // itself — see `SUGGEST` for why only that one.
      ...(item.requiredProps.length === 0 ? {} : { command: SUGGEST }),
      ...(insertion === undefined
        ? {}
        : {
            additionalTextEdits: [
              { range: rangeOf(document, insertion.span), newText: insertion.newText },
            ],
          }),
    };
  });
}

/**
 * `class:red`, `class:yellow` — the conditional classes of this file, at a gap in a native tag.
 *
 * The same items the projection puts in a component's `$gap`, written here because a native tag
 * has no `$gap` to put anything in: HTML answers that position and this plugin adds to its
 * answer. One thing, one icon, one insertion — `class:red=@` and ask again — wherever it is
 * asked for.
 *
 * Empty when the file declares no class, and empty is the right answer then: `class:` with no
 * name behind it completes nothing, and an item that inserts a half-written binding is worse
 * than no item.
 */
/**
 * What hovering a `control` says, which is what the element takes and why.
 *
 * One card per kind, and the whole point is that they DIFFER: the same six characters mean
 * three things depending on the tag under them (decision 109), and that is precisely the fact
 * an author cannot read off the source. A component gets the fourth, which is honest about
 * where the answer lives — in the child's own contract (decision 112).
 */
function controlHover(wants: ReturnType<typeof controlWants> & {}): string {
  const head = '**`control`** · fudic';

  switch (wants) {
    case 'form':
      return `${head}\n\nEnlaza este \`<form>\` con el formulario: \`control=@userForm\`.\n\nValida al enviar y lleva el foco al primer campo con error.`;
    case 'control':
      return `${head}\n\nEnlaza este campo con un control del formulario: \`control=@userForm.alias\`.\n\nEl enlace lo elige el elemento: \`type\`, \`multiple\` y el tag deciden cuál de los seis.`;
    case 'group':
      return `${head}\n\nAgrupa parte del formulario en este elemento: \`control=@userForm.direccion\`.\n\nToma un grupo o el formulario entero, nunca un control suelto.`;
    default:
      return `${head}\n\nCruza el nodo al componente por su prop \`${CONTROL_PROP}\`: \`control=@userForm.alias\`.\n\nQué encaja lo dice el \`${CONTROL_PROP}\` que el componente declara.`;
  }
}

/**
 * `control` at a gap in a NATIVE tag: `<input |>`, `<form |>`, `<div co|>`.
 *
 * The attribute the author was expected to invent. It is not HTML's, so the HTML service has
 * never heard of it; it is not a prop, so no `$gap` carries it; and unlike `class:` it does not
 * even announce itself with a prefix a developer could guess at. Inside a form it is the reason
 * the element is being written, and it was the one binding of the grammar the editor could not
 * be asked for.
 *
 * `control=@` and ask again, which is what every binding here does — the value is a node, and
 * the list of nodes is the interesting half. What the DETAIL says is which of the three the
 * element takes (decision 109), so the author reads «form» over a `<form>` and «control» over
 * an `<input>` without having to know the table.
 *
 * Empty is the ordinary answer: outside a form there is nothing to bind, and a `control` there
 * is `FUD0595`.
 */
function controlItems(
  offer: ControlOffer | undefined,
  document: TextDocument,
  gap: PartialName,
): readonly CompletionItem[] {
  if (offer === undefined) return [];

  return [
    {
      label: CONTROL_NAME,
      kind: CompletionItemKind.Property,
      detail: `${offer.label} of the form`,
      // Ahead of the classes and of HTML's own vocabulary, which sorts by its labels.
      sortText: `0_${CONTROL_NAME}`,
      labelDetails: { description: 'fudic' },
      textEdit: {
        range: rangeOf(document, gap.span),
        newText: `${CONTROL_NAME}=${EXPRESSION_PREFIX}`,
      },
      command: { title: 'Suggest', command: 'editor.action.triggerSuggest' },
    },
  ];
}

/**
 * The nodes that fit in a `control` whose `@` is not typed yet, each item writing the `@`.
 *
 * The same narrowing `ts-completion.ts` applies one character later, and the same two questions
 * behind it: which names are NODES, which the checker answers, and which KIND this element
 * takes, which the tag answers (decision 109). What differs is only where the names come from
 * — see the caller.
 *
 * Nothing, never an empty list, when the checker cannot answer: `list` would keep an empty
 * widget open over the value, and a widget that is up swallows the next <kbd>Tab</kbd>.
 */
function controlNodeList(
  service: ReturnType<typeof typeScriptService>,
  cached: CachedDocument,
  element: ElementNode,
  document: TextDocument,
  binding: PartialName,
): CompletionList | undefined {
  const wants = controlWants(element, element.name.includes('-'));
  if (wants === undefined) return undefined;

  const range = rangeOf(document, binding.span);
  const items: CompletionItem[] = [];

  for (const [name, kind] of nodesInScope(service, cached.path, 0)) {
    // `reaches` and not `accepts`, which is the same rule the other list keeps and had to be
    // the same rule: `@userForm` is not what an `<input>` binds, and `@userForm.alias` cannot be
    // written without it. Filtered the narrow way, the position went empty in the ordinary case
    // — a form whose fields are all one level down.
    if (!reaches(wants, kind)) continue;
    items.push({
      // WITH the `@`, because that is how a node is reached — the same rule `scopeItems` keeps,
      // and `filterText` keeps the bare name for the same reason it does there.
      label: `${EXPRESSION_PREFIX}${name}`,
      filterText: name,
      kind: CompletionItemKind.Variable,
      detail: kind === 'control' ? 'control' : 'form node',
      sortText: `0_${name}`,
      labelDetails: { description: 'fudic' },
      textEdit: { range, newText: `${EXPRESSION_PREFIX}${name}` },
      // A group or a form is almost always reached THROUGH — `@userForm.name` — so the list of
      // its fields is the next question, and it is asked without a keystroke.
      command: { title: 'Suggest', command: 'editor.action.triggerSuggest' },
    });
  }
  return items.length === 0 ? undefined : list(items, true);
}

function classBindingItems(
  cached: CachedDocument,
  document: TextDocument,
  gap: PartialName,
): readonly CompletionItem[] {
  const range = rangeOf(document, gap.span);
  return styleClassNames(cached).map((name) => ({
    label: `${CLASS_PREFIX}${name}`,
    kind: CompletionItemKind.EnumMember,
    detail: 'class of this file',
    // Ahead of HTML's own vocabulary, which the service beside this one contributes unsorted.
    sortText: `0_${name}`,
    labelDetails: { description: 'fudic' },
    textEdit: { range, newText: `${CLASS_PREFIX}${name}=@` },
    command: { title: 'Suggest', command: 'editor.action.triggerSuggest' },
  }));
}

/**
 * The names the template can see, plus `@()`, in the coordinates of the `.fud` itself.
 *
 * The range covers the partial name and NOT the `@`, and that is a rule about the editor
 * rather than about the grammar. VS Code filters the list it was sent against the text
 * between the start of an item's replacement range and the caret: with the `@` inside the
 * range that text is `@t`, and `title` does not start with `@t`, so the editor DROPS an item
 * the server sent correctly. It is invisible from the protocol log — the item is there, on
 * the wire, and never reaches the list. `@section` survived the same filter only because its
 * own label begins with the `@`.
 *
 * Leaving the `@` out makes the filter text `t`, which is what the labels are written
 * against, and the insertion still reads `@title`: the `@` the author typed is simply not
 * replaced. It is also exactly what the projection's own items do, which is why those were
 * the ones showing up.
 */
function scopeItems(
  cached: CachedDocument,
  document: TextDocument,
  context: PartialName,
  callableOnly: boolean,
  /**
   * Whether the author has already typed the `@`.
   *
   * With one typed it is left alone and the item writes the bare name. With none — a plain
   * Ctrl+Space in markup — the item writes the `@` itself: the names in scope are only reachable
   * through one, and an editor that knows that and makes the developer type it anyway is
   * withholding the only part it could have done for them.
   */
  atTyped = true,
): readonly CompletionItem[] {
  // A layout interpolates nothing, `@()` included: see `interpolates`.
  if (!interpolates(cached)) return [];

  // At the CONTEXT's offset, so the bindings of the loops around it are in the list too.
  const scope = templateScope(cached, context.span.end);
  // What is REPLACED is the name alone, never the `@`. See the note above: with the `@` inside
  // the range VS Code filters the labels against `@t` and drops every one of them.
  const typed = atTyped ? context.text.length - 1 : context.text.length;
  const range = rangeOf(document, span(context.span.end - typed, context.span.end));
  const open = atTyped ? '' : '@';

  const names = scopeNames(scope, callableOnly).map(
    (name): CompletionItem => ({
      // WITH the `@`, because that is how the name is written: `@data.title`, `@click=@fn`. A
      // list that spells them bare teaches that `data` is written `data`, which it never is.
      label: `${EXPRESSION_PREFIX}${name}`,
      // And the filter keeps the bare name: the editor matches an item against the text from
      // the start of its range to the caret, and that range begins after the `@`. See the note
      // above — it is the same trap, and this is the other half of it.
      filterText: name,
      kind:
        scope.get(name) === 'function' ? CompletionItemKind.Function : CompletionItemKind.Variable,
      detail: 'in scope',
      sortText: `1_${name}`,
      textEdit: { range, newText: `${open}${name}` },
    }),
  );

  return [
    ...names,
    {
      label: '@()',
      kind: CompletionItemKind.Snippet,
      detail: 'expression',
      // After the names, which are the likelier answer, and before anything anybody else
      // contributes. Inside an attribute's value that second half is the point: the HTML
      // service answers there too — `role` has an enumeration, `href` has paths — and a way out
      // to an expression sorted below a hundred and thirteen ARIA roles is a way out nobody
      // finds. `1_` keeps it under the scope names, and both stay above HTML's own, which sort
      // by their labels.
      sortText: '1_zz_@(',
      labelDetails: { description: 'fudic' },
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: { range, newText: `${open}($0)` },
    },
  ];
}

/** The snippets that apply here, filtered by how they are typed. */
function snippetItems(
  cached: CachedDocument,
  document: TextDocument,
  context: PartialName,
  wanted: (label: string) => boolean,
): readonly CompletionItem[] {
  return snippetsAt(cached, context.span.start)
    .filter((snippet) => wanted(snippet.label))
    .map((snippet) => ({
      label: snippet.label,
      kind: CompletionItemKind.Snippet,
      detail: snippet.detail,
      sortText: `0_${snippet.label}`,
      labelDetails: { description: 'fudic' },
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: { range: rangeOf(document, context.span), newText: snippet.body },
    }));
}

/**
 * A completion list, complete unless the caller says its answer depends on what is typed next.
 *
 * Complete is the default because the candidates here are finite, known sets — the `.fud` files
 * of the project, the sections of the layout, the classes of a `<style>`.
 *
 * A binding's VALUE is not one of them, and the difference is not cosmetic. What the server
 * answers there is decided by the text before the caret — empty means the names in scope,
 * anything written means silence (`valueBegun`) — so the reply is stale the moment a character
 * lands. A COMPLETE list tells VS Code the opposite: it caches the reply and filters it in the
 * client from then on, against each item's `filterText`, and never asks again. That is what
 * kept the list standing over `.id=t` (a `t` is inside `items`) and over `.name=H` (an `h` is
 * inside `handlerClick`) while the server was returning nothing at both — and a list left open
 * turns the Tab meant for the next prop into an accept (BUG-23 task 25).
 */
function list(items: readonly CompletionItem[], incomplete = false): CompletionList {
  // Never over an EMPTY list, whatever the caller asked for. `isIncomplete` means «ask me
  // again», so an empty incomplete list is a session VS Code keeps alive: it renders «No
  // suggestions» rather than closing, and a widget that is up still swallows the first Tab.
  // Nothing to offer has to mean the list goes away.
  return { isIncomplete: incomplete && items.length > 0, items: [...items] };
}
