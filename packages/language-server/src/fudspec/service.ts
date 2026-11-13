/**
 * The service of a `.fudspec` (SDD-52 §4.4): diagnostics, completion, hover, definition and
 * semantic tokens, and since SDD-53 the light bulb and formatting; only for a `.fudspec`. Every request starts by asking whether the
 * document is one and answers nothing otherwise, so this service never speaks in a `.fud` —
 * and, with no embedded codes, no service of the `.fud` finds anything to speak in here.
 *
 * Diagnostics are pushed with `interFileDependencies`: a term module, a fixture or a component
 * that changes on disk changes what an open `.fudspec` says, and the server asks for a refresh
 * when one does (`SpecHost.affects`).
 */

import { docsUrl, type Policy, type Severity, type SourceDiagnostic } from '@fudic/diagnostics';
import { formatSpec, validateSpec } from '@fudic/spec';
import { governFile, propShapes } from '@fudic/typecheck';
import type { LanguageServicePlugin, SemanticToken } from '@volar/language-service';
import {
  DiagnosticSeverity,
  type Diagnostic as LspDiagnostic,
} from 'vscode-languageserver-protocol';
import { SEMANTIC_TOKENS_LEGEND } from '../capabilities.js';
import type { RequestStats } from '../stats.js';
import { pathToUri } from '../uri.js';
import { explainActions } from '../services/actions.js';
import { codeCompletionList, codeHover, hashFileActions, nearbyCodes, type ConfigFile } from '../services/suppressions.js';
import { typeScriptService } from '../services/ts-service.js';
import { specCodeActions } from './actions.js';
import { specCompletions } from './completion.js';
import { rangeIn, spanRange, specDocumentOf, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';
import { specDefinition, specHover } from './navigation.js';
import { specSemanticTokens } from './semantic-tokens.js';

export interface FudspecServiceContext {
  readonly host: SpecHost;
  readonly stats: RequestStats;
  /** How the project of a file reports each code; absent, every code as it is. */
  readonly policyFor?: (path: string) => Policy | null;
  /** The `fudic.json` the project of a file is declared in, where a code is turned off; absent, none is. */
  readonly configFileFor?: (path: string) => ConfigFile | undefined;
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
      codeActionProvider: { codeActionKinds: ['quickfix'] },
      documentFormattingProvider: true,
    },

    create(context) {
      /** Everything said about a `.fudspec` before its policy and its comments. */
      const found = (spec: SpecDocument) => [...spec.parseDiagnostics, ...validateSpec(spec.file, host.context(spec.path))];
      /** What is shown about it: under the project's policy and its own comments. */
      const shown = (spec: SpecDocument) =>
        governFile(spec.path, spec.text, found(spec), deps.policyFor?.(spec.path) ?? null, { complete: true });

      return {
        provideDiagnostics(document, token) {
          return stats.run(
            'diagnostics',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              if (spec === undefined) return undefined;
              return shown(spec).map((d) => toLsp(spec, d, host));
            },
            undefined,
          );
        },

        provideCodeActions(document, range, _codeActionContext, token) {
          return stats.run(
            'codeActions',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              if (spec === undefined) return undefined;
              const start = document.offsetAt(range.start);
              const end = document.offsetAt(range.end);
              const repairs = specCodeActions({
                spec,
                host,
                document,
                start,
                end,
                // The project's program, the one the `.fud` services read the card from. Without
                // TypeScript a fixture is still created, with its keys and no props (SDD-53 §4.5).
                propsOf: (path) => {
                  const program = typeScriptService(context)?.getProgram();
                  return program === undefined ? undefined : propShapes(program, path);
                },
              });
              const config = deps.configFileFor?.(spec.path);
              const file = { uri: document.uri, path: spec.path, text: spec.text, ...(config === undefined ? {} : { config }) };
              // Every code explains itself, as in a `.fud` (SDD-75).
              return [...repairs, ...hashFileActions(file, shown(spec), start, end), ...explainActions(found(spec), start, end)];
            },
            undefined,
          );
        },

        provideDocumentFormattingEdits(document, _range, _options, _embedded, token) {
          return stats.run(
            'formatting',
            token,
            () => {
              const spec = specDocumentOf(context, document);
              if (spec === undefined) return undefined;
              const formatted = formatSpec(spec.text);
              // An empty list, not `undefined`, when there is nothing to do: a nullish answer
              // sends Volar on to the next service, and no other one knows a `.fudspec`.
              if (!formatted.ok || formatted.text === spec.text) return [];
              return [{ range: spanRange(spec, { start: 0, end: spec.text.length }), newText: formatted.text }];
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
              if (spec === undefined) return undefined;
              const offset = document.offsetAt(position);
              return codeCompletionList(document, offset, (slot) => nearbyCodes(slot, spec.text, found(spec))) ?? specCompletions(spec, offset, host);
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
              if (spec === undefined) return undefined;
              const offset = document.offsetAt(position);
              return codeHover(document, offset, deps.policyFor?.(spec.path) ?? null) ?? specHover(spec, offset, host);
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
