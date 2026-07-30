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

import { CompletionItemKind, DiagnosticSeverity } from 'vscode-languageserver-protocol';
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
import type { Diagnostic, Severity, Span } from '@fudic/compiler';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { SEMANTIC_TOKENS_LEGEND } from '../capabilities.js';
import type { CachedDocument } from '../document-cache.js';
import { FUD_LANGUAGE_ID, type FudicVirtualCode } from '../virtual-code.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { RequestStats } from '../stats.js';
import { fudicDiagnostics } from './compiler-diagnostics.js';
import { hrefCompletions, unresolvedHrefs } from './href.js';
import { hrefContextAt, sectionContextAt, tagContextAt } from './position.js';
import { sectionCompletions } from './sections.js';
import { declaredTags, documentLinks, tagDefinitionAt } from './tags.js';
import { semanticTokens } from './semantic-tokens.js';

/** What the service needs from the server around it. */
export interface FudicServiceContext {
  readonly index: WorkspaceIndex;
  readonly stats: RequestStats;
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
 */
export function fudicDocumentOf(
  context: LanguageServiceContext,
  document: TextDocument,
): CachedDocument | undefined {
  if (document.languageId !== FUD_LANGUAGE_ID) return undefined;

  const uri = URI.parse(document.uri);
  const decoded = context.decodeEmbeddedDocumentUri(uri);
  const root = context.language.scripts.get(decoded?.[0] ?? uri)?.generated?.root as
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

/** The service. */
export function createFudicService(deps: FudicServiceContext): LanguageServicePlugin {
  const { index, stats } = deps;

  return {
    name: 'fudic',
    capabilities: {
      // The trigger characters of §3.2 that this service is the one to answer: `"` and `/` inside
      // an href, `<` for a tag, and the space after `@section`.
      completionProvider: { triggerCharacters: ['@', '<', '"', '/', ' '] },
      documentLinkProvider: { resolveProvider: false },
      // Only the tag: everything inside it is answered by TypeScript over the projection.
      definitionProvider: true,
      semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND },
      diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
      codeActionProvider: {},
    },

    create(context) {
      return {
        provideCompletionItems(document, position, _completionContext, token) {
          return stats.run(token, () => completions(context, document, position, index), undefined);
        },

        provideDefinition(document, position, token) {
          return stats.run(
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

        provideDocumentLinks(document, token) {
          return stats.run(
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

        provideCodeActions(document, range, _codeActionContext, token) {
          return stats.run(
            token,
            () => {
              const cached = fudicDocumentOf(context, document);
              if (cached === undefined) return undefined;

              return unresolvedHrefs(cached, index)
                .filter((unresolved) => overlaps(rangeOf(document, unresolved.value), range))
                .map(
                  (unresolved): CodeAction => ({
                    title: `Create ${unresolved.href}`,
                    kind: 'quickfix',
                    edit: {
                      documentChanges: [
                        {
                          kind: 'create',
                          uri: URI.file(unresolved.target).toString(),
                          options: { ignoreIfExists: true },
                        },
                      ],
                    },
                  }),
                );
            },
            undefined,
          );
        },
      };
    },
  };
}

/** The three completions the server owns, in the order they can apply. */
function completions(
  context: LanguageServiceContext,
  document: TextDocument,
  position: { line: number; character: number },
  index: WorkspaceIndex,
): CompletionList | undefined {
  const cached = fudicDocumentOf(context, document);
  if (cached === undefined) return undefined;

  const offset = document.offsetAt(position);
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

  const tag = tagContextAt(cached.source, offset);
  if (tag !== undefined) {
    return list(
      declaredTags(cached, index).map((item) => ({
        label: item.tag,
        kind: CompletionItemKind.Class,
        detail: item.href,
        // Sorted ahead of the native tags the HTML service contributes, and labelled, so the
        // two groups are told apart in the list (§6.4).
        sortText: `0_${item.tag}`,
        labelDetails: { description: 'fudic component' },
        textEdit: { range: rangeOf(document, tag.span), newText: item.tag },
      })),
    );
  }
  return undefined;
}

/** A completion list is never incomplete here: the candidates are a finite, known set. */
function list(items: readonly CompletionItem[]): CompletionList {
  return { isIncomplete: false, items: [...items] };
}
