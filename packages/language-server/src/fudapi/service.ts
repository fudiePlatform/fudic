/**
 * The service of a `.fudapi` (SDD-60 §4.9): diagnostics, completion, hover, definition, semantic
 * tokens and formatting; only for a `.fudapi`. Every request starts by asking whether the
 * document is one and answers nothing otherwise, so this service never speaks in a `.fud` —
 * and, with no embedded codes, no service of the `.fud` finds anything to speak in here.
 *
 * Diagnostics are pushed with `interFileDependencies`: another `.fudapi` or a `package.json`
 * that changes on disk changes what an open one says, and the server asks for a refresh when
 * one does (`ApiHost.affects`).
 */

import { formatApi } from '@fudic/api';
import { docsUrl, type Severity, type SourceDiagnostic } from '@fudic/diagnostics';
import type { LanguageServicePlugin, SemanticToken } from '@volar/language-service';
import { DiagnosticSeverity, type Diagnostic as LspDiagnostic } from 'vscode-languageserver-protocol';
import { SEMANTIC_TOKENS_LEGEND } from '../capabilities.js';
import type { RequestKind, RequestStats } from '../stats.js';
import type { CancellationToken } from 'vscode-languageserver-protocol';
import { pathToUri } from '../uri.js';
import { apiCompletions } from './completion.js';
import { apiDocumentOf, rangeOf, type ApiDocument } from './document.js';
import type { ApiHost } from './host.js';
import type { ImplementationIndex } from './implementations.js';
import type { ApiGenerated } from './generated.js';
import { generatedLenses, implementationLenses, typeLenses } from './lenses.js';
import { catchesHover } from './catches-hover.js';
import { loadHover } from './load-line.js';
import { apiDefinition, apiHover } from './navigation.js';
import { apiSemanticTokens } from './semantic-tokens.js';
import { translationsMarkdown, type Translations } from '../translations.js';

export interface FudapiServiceContext {
  readonly host: ApiHost;
  readonly stats: RequestStats;
  /** Who implements each declaration, for the lenses over them (SDD-75 §4.2). */
  readonly implementations: ImplementationIndex;
  /** What the file generates, and the last text of it that had no error (SDD-75 §4.3). */
  readonly generated: ApiGenerated;
  /** The catalogs, for the hover over a text (SDD-74 §4.5): its line per locale, — where it is missing. */
  readonly translations?: Translations;
}

const SEVERITY: Readonly<Record<Severity, DiagnosticSeverity>> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/** A diagnostic as LSP, its related locations in whichever `.fudapi` they are. */
function toLsp(doc: ApiDocument, d: SourceDiagnostic, host: ApiHost): LspDiagnostic {
  const related = (d.related ?? []).map((r) => {
    const path = r.file ?? doc.path;
    const text = path === doc.path ? doc.text : (host.read(path) ?? '');
    return { location: { uri: pathToUri(path).toString(), range: rangeOf(path, text, r.span) }, message: r.message };
  });
  return {
    range: rangeOf(doc.path, doc.text, d.span),
    severity: SEVERITY[d.severity],
    code: d.code,
    codeDescription: { href: docsUrl(d.code) },
    source: 'fudic',
    message: d.message,
    ...(related.length > 0 ? { relatedInformation: related } : {}),
  };
}

/** The translations of the text under `offset`, as the hover over a message of a `.fud` shows them. */
function textHover(doc: ApiDocument, offset: number, translations: Translations | undefined): { contents: { kind: 'markdown'; value: string } } | undefined {
  const found = translations?.at(doc.path, doc.text, offset);
  return found === undefined ? undefined : { contents: { kind: 'markdown', value: translationsMarkdown(found) } };
}

export function createFudapiService(deps: FudapiServiceContext): LanguageServicePlugin {
  const { host, stats, implementations, generated, translations } = deps;

  return {
    name: 'fudapi',
    capabilities: {
      // `{` asks for the placeholders of a text; a space, for what follows a keyword.
      completionProvider: { triggerCharacters: ['{', ' '] },
      hoverProvider: true,
      definitionProvider: true,
      semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND },
      diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
      documentFormattingProvider: true,
      codeLensProvider: { resolveProvider: false },
    },

    create(context) {
      const run = <T>(kind: RequestKind, token: CancellationToken, work: () => T): T | undefined =>
        stats.run<T | undefined>(kind, token, work, undefined);

      return {
        provideDiagnostics(document, token) {
          return run('diagnostics', token, () => {
            const doc = apiDocumentOf(context, document, host);
            if (doc === undefined) return undefined;
            return generated.check(doc.path, doc.text, doc).map((d) => toLsp(doc, d, host));
          });
        },

        provideDocumentFormattingEdits(document, _range, _options, _embedded, token) {
          return run('formatting', token, () => {
            const doc = apiDocumentOf(context, document, host);
            if (doc === undefined) return undefined;
            const formatted = formatApi(doc.text);
            // An empty list, not `undefined`, when there is nothing to do: a nullish answer
            // sends Volar on to the next service, and no other one knows a `.fudapi`.
            if (formatted === doc.text) return [];
            return [{ range: rangeOf(doc.path, doc.text, { start: 0, end: doc.text.length }), newText: formatted }];
          });
        },

        provideCompletionItems(document, position, _completionContext, token) {
          return run('completion', token, () => {
            const doc = apiDocumentOf(context, document, host);
            return doc === undefined ? undefined : apiCompletions(doc, document.offsetAt(position));
          });
        },

        provideHover(document, position, token) {
          return run('hover', token, () => {
            const doc = apiDocumentOf(context, document, host);
            if (doc === undefined) return undefined;
            const offset = document.offsetAt(position);
            return apiHover(doc, offset, host) ?? loadHover(doc, offset) ?? catchesHover(doc, offset) ?? textHover(doc, offset, translations);
          });
        },

        provideDefinition(document, position, token) {
          return run('definition', token, () => {
            const doc = apiDocumentOf(context, document, host);
            return doc === undefined ? undefined : apiDefinition(doc, document.offsetAt(position), host);
          });
        },

        provideCodeLenses(document, token) {
          return run('codeLens', token, () => {
            const doc = apiDocumentOf(context, document, host);
            if (doc === undefined) return undefined;
            const project = host.projectOf(doc.path);
            return [
              ...generatedLenses(doc),
              ...implementationLenses(doc, project, implementations.of(host.implementationFolders(doc.path), doc.source.id)),
              ...typeLenses(doc, host.typesText(doc.path)),
            ];
          });
        },

        provideDocumentSemanticTokens(document, _range, legend, token) {
          return run('semanticTokens', token, () => {
            const doc = apiDocumentOf(context, document, host);
            if (doc === undefined) return undefined;
            return apiSemanticTokens(doc).map((t): SemanticToken => {
              const start = document.positionAt(t.span.start);
              const modifiers = t.modifiers.reduce((bits, m) => bits | (1 << legend.tokenModifiers.indexOf(m)), 0);
              return [start.line, start.character, t.span.end - t.span.start, legend.tokenTypes.indexOf(t.type), modifiers];
            });
          });
        },
      };
    },
  };
}
