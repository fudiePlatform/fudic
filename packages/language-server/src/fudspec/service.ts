/**
 * The service of a `.fudspec` (SDD-52 §4.4): diagnostics, completion, hover, definition and
 * semantic tokens, and only for a `.fudspec`. Every request starts by asking whether the
 * document is one and answers nothing otherwise, so this service never speaks in a `.fud` —
 * and, with no embedded codes, no service of the `.fud` finds anything to speak in here.
 *
 * Diagnostics are pushed with `interFileDependencies`: a term module, a fixture or a component
 * that changes on disk changes what an open `.fudspec` says, and the server asks for a refresh
 * when one does (`SpecHost.affects`).
 */

import { docsUrl, type Severity, type SourceDiagnostic } from '@fudic/diagnostics';
import { validateSpec } from '@fudic/spec';
import type { LanguageServicePlugin, SemanticToken } from '@volar/language-service';
import {
  DiagnosticSeverity,
  type Diagnostic as LspDiagnostic,
} from 'vscode-languageserver-protocol';
import { SEMANTIC_TOKENS_LEGEND } from '../capabilities.js';
import type { RequestStats } from '../stats.js';
import { pathToUri } from '../uri.js';
import { specCompletions } from './completion.js';
import { rangeIn, specDocumentOf, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';
import { specDefinition, specHover } from './navigation.js';
import { specSemanticTokens } from './semantic-tokens.js';

export interface FudspecServiceContext {
  readonly host: SpecHost;
  readonly stats: RequestStats;
}

const SEVERITY: Readonly<Record<Severity, DiagnosticSeverity>> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/** A diagnostic as LSP, its related locations in whichever file they are (a term's `.js`). */
function toLsp(spec: SpecDocument, d: SourceDiagnostic, host: SpecHost): LspDiagnostic {
  const read = (path: string): string | undefined => host.read(path);
  const related = (d.related ?? []).map((r) => {
    const path = r.file ?? spec.path;
    return { location: { uri: pathToUri(path).toString(), range: rangeIn(spec, path, r.span, read) }, message: r.message };
  });
  return {
    range: rangeIn(spec, spec.path, d.span, read),
    severity: SEVERITY[d.severity],
    code: d.code,
    codeDescription: { href: docsUrl(d.code) },
    source: 'fudic',
    message: d.message,
    ...(related.length > 0 ? { relatedInformation: related } : {}),
  };
}

export function createFudspecService(deps: FudspecServiceContext): LanguageServicePlugin {
  const { host, stats } = deps;

  return {
    name: 'fudspec',
    capabilities: {
      // `:` is the one character inside a line that asks for something: after `role`.
      completionProvider: { triggerCharacters: [':'] },
      hoverProvider: true,
      definitionProvider: true,
      semanticTokensProvider: { legend: SEMANTIC_TOKENS_LEGEND },
      diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
    },

    create(context) {
      return {
        provideDiagnostics(document, token) {
          return stats.run(
            'diagnostics',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              if (spec === undefined) return undefined;
              const found = [...spec.parseDiagnostics, ...validateSpec(spec.file, host.context(spec.path))];
              return found.map((d) => toLsp(spec, d, host));
            },
            undefined,
          );
        },

        provideCompletionItems(document, position, _completionContext, token) {
          return stats.run(
            'completion',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              return spec === undefined ? undefined : specCompletions(spec, document.offsetAt(position), host);
            },
            undefined,
          );
        },

        provideHover(document, position, token) {
          return stats.run(
            'hover',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              return spec === undefined ? undefined : specHover(spec, document.offsetAt(position), host);
            },
            undefined,
          );
        },

        provideDefinition(document, position, token) {
          return stats.run(
            'definition',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              return spec === undefined ? undefined : specDefinition(spec, document.offsetAt(position), host);
            },
            undefined,
          );
        },

        provideDocumentSemanticTokens(document, _range, legend, token) {
          return stats.run(
            'semanticTokens',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              if (spec === undefined) return undefined;
              return specSemanticTokens(spec, host).map((item): SemanticToken => {
                const start = document.positionAt(item.span.start);
                const modifiers = item.modifiers.reduce(
                  (bits, modifier) => bits | (1 << legend.tokenModifiers.indexOf(modifier)),
                  0,
                );
                return [start.line, start.character, item.span.end - item.span.start, legend.tokenTypes.indexOf(item.type), modifiers];
              });
            },
            undefined,
          );
        },
      };
    },
  };
}
