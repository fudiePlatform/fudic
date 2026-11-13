/**
 * The service of the three `.headers` files of an app (SDD-84 §3.8): diagnostics, completion, hover
 * and bulbs; only for a file called `page.headers`, `sw.headers` or `assets.headers`, and nothing in
 * any other document.
 *
 * What the reader says is what the build says, from the same `parseHeaders`, under the project's
 * policy and the file's own `#` comments. What needs the output — `FUD1545`, `FUD1548`, `FUD1556` —
 * comes from what the last build or dev left in `.fudic/csp-needs.json`, checked against the text in
 * the buffer: without that file the editor says nothing of them rather than guess (§3.4). The server
 * asks for a refresh when that file or a `.headers` changes on disk.
 */

import { dirname } from 'node:path';
import {
  checkNeeds,
  CSP_NEEDS_FILE,
  cspOf,
  HEADERS_FILES,
  KNOWN_HEADERS,
  parseHeaders,
  readCspNeeds,
  CSP_DIRECTIVES,
  type AssetRule,
  type CspPolicy,
  type HeaderEntry,
  type HeadersKind,
  type NeedFinding,
  type ProjectConfig,
} from '@fudic/config';
import { docsUrl, FUD1554, type FileDiagnostic, type Policy, type Severity, type SourceDiagnostic } from '@fudic/diagnostics';
import { governFile } from '@fudic/typecheck';
import type { CompletionItem, LanguageServicePlugin } from '@volar/language-service';
import { CompletionItemKind, DiagnosticSeverity, type CancellationToken, type Diagnostic as LspDiagnostic } from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { explainActions } from '../services/actions.js';
import { codeCompletionList, codeHover, hashFileActions, nearbyCodes, type ConfigFile } from '../services/suppressions.js';
import type { RequestKind, RequestStats } from '../stats.js';
import { uriToPath } from '../uri.js';
import { headersActions } from './actions.js';
import { hoverAt, slotAt, sourcesFor } from './position.js';

export interface HeadersServiceDeps {
  readonly stats: RequestStats;
  /** Where `sw.json` and `.fudic/csp-needs.json` are read from. */
  readonly readFile: (path: string) => string | undefined;
  /** The project a file belongs to; absent, every file is an app's. */
  readonly projectFor?: (path: string) => { readonly config: ProjectConfig } | null;
  /** How the project of a file reports each code; absent, every code as it is. */
  readonly policyFor?: (path: string) => Policy | null;
  /** The `fudic.json` a code is turned off in; absent, none is. */
  readonly configFileFor?: (path: string) => ConfigFile | undefined;
}

const SEVERITY: Readonly<Record<Severity, DiagnosticSeverity>> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/** The kind of a document by its name; undefined for any other document. */
export function headersKindOf(uri: string): HeadersKind | undefined {
  const name = uri.slice(uri.lastIndexOf('/') + 1);
  return (Object.keys(HEADERS_FILES) as HeadersKind[]).find((kind) => HEADERS_FILES[kind] === name);
}

/** One `.headers` read in the editor: what it holds and everything said about it before its policy. */
export interface HeadersAnalysis {
  readonly kind: HeadersKind;
  readonly path: string;
  readonly text: string;
  readonly entries: readonly (HeaderEntry | AssetRule)[];
  readonly found: readonly SourceDiagnostic[];
  /** Its `Content-Security-Policy`, in `page.headers` and `sw.headers`. */
  readonly policy: CspPolicy | undefined;
  readonly findings: readonly NeedFinding[];
}

/** What the build says of this `.headers`, over the text in the buffer; undefined for another document. */
export function analyzeHeaders(document: TextDocument, deps: HeadersServiceDeps): HeadersAnalysis | undefined {
  const kind = headersKindOf(document.uri);
  if (kind === undefined) return undefined;
  const path = uriToPath(URI.parse(document.uri));
  const root = dirname(path).replace(/\\/gu, '/');
  const text = document.getText();
  const file = HEADERS_FILES[kind];
  // The file as the build places it: on its full path, so its own comments apply (SDD-84 §8.2.17).
  const located = (d: FileDiagnostic): SourceDiagnostic => ({ ...d, file: path, span: d.span ?? { start: 0, end: 0 } });
  const lib = deps.projectFor?.(path)?.config.kind === 'lib';
  if (lib || (kind === 'sw' && deps.readFile(`${root}/sw.json`) === undefined)) {
    // It applies to nothing, and the build reads nothing more of it.
    return { kind, path, text, entries: [], found: [located(FUD1554({ file, reason: lib ? 'lib' : 'no-sw' }))], policy: undefined, findings: [] };
  }
  const parsed = parseHeaders(kind, text);
  const policy = kind === 'assets' ? undefined : cspOf(text, parsed.entries as readonly HeaderEntry[]);
  const needs = kind === 'assets' ? undefined : readCspNeeds(deps.readFile(`${root}/${CSP_NEEDS_FILE}`))[kind];
  const findings = needs === undefined ? [] : checkNeeds(kind as 'page' | 'sw', policy, needs, file);
  const found = [...parsed.diagnostics, ...findings.map((f) => f.diagnostic)].map(located);
  return { kind, path, text, entries: parsed.entries, found, policy, findings };
}

function toLsp(document: TextDocument, d: SourceDiagnostic): LspDiagnostic {
  return {
    range: { start: document.positionAt(d.span.start), end: document.positionAt(d.span.end) },
    severity: SEVERITY[d.severity],
    code: d.code,
    codeDescription: { href: docsUrl(d.code) },
    source: 'fudic',
    message: d.message,
  };
}

/** The completion items of what is being written at `offset`. */
function completionItems(document: TextDocument, analysis: HeadersAnalysis, offset: number): CompletionItem[] | undefined {
  const slot = slotAt(analysis.kind, analysis.text, offset);
  if (slot === undefined) return undefined;
  const range = { start: document.positionAt(slot.start), end: document.positionAt(offset) };
  const item = (label: string, kind: CompletionItemKind, newText = label): CompletionItem => ({ label, kind, textEdit: { range, newText } });
  switch (slot.kind) {
    case 'name':
      return [...KNOWN_HEADERS.values()].map((h) => item(h.name, CompletionItemKind.Property, `${h.name}: `));
    case 'directive':
      return CSP_DIRECTIVES.map((d) => item(d, CompletionItemKind.Keyword));
    case 'source':
      return sourcesFor(analysis.kind, slot.directive).map((s) => item(s, CompletionItemKind.Constant));
    case 'value':
      return slot.values.map((v) => item(v, CompletionItemKind.EnumMember));
  }
}

export function createHeadersService(deps: HeadersServiceDeps): LanguageServicePlugin {
  return {
    name: 'fudic-headers',
    capabilities: {
      // A space after a directive asks for its sources; `:` after a name, for its values.
      completionProvider: { triggerCharacters: [' ', ':', "'", '-'] },
      hoverProvider: true,
      diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false },
      codeActionProvider: { codeActionKinds: ['quickfix'] },
    },

    create() {
      const run = <T>(kind: RequestKind, token: CancellationToken, work: () => T): T | undefined =>
        deps.stats.run<T | undefined>(kind, token, work, undefined);
      /** What is shown about a `.headers`: under the project's policy and its own `#` comments. */
      const shown = (analysis: HeadersAnalysis) =>
        governFile(analysis.path, analysis.text, analysis.found, deps.policyFor?.(analysis.path) ?? null, { complete: true });

      return {
        provideDiagnostics(document, token) {
          return run('diagnostics', token, () => {
            const analysis = analyzeHeaders(document, deps);
            return analysis === undefined ? undefined : shown(analysis).map((d) => toLsp(document, d));
          });
        },

        provideCompletionItems(document, position, _context, token) {
          return run('completion', token, () => {
            const analysis = analyzeHeaders(document, deps);
            if (analysis === undefined) return undefined;
            const offset = document.offsetAt(position);
            const codes = codeCompletionList(document, offset, (slot) => nearbyCodes(slot, analysis.text, analysis.found));
            if (codes !== undefined) return codes;
            const items = completionItems(document, analysis, offset);
            return items === undefined ? undefined : { isIncomplete: false, items };
          });
        },

        provideHover(document, position, token) {
          return run('hover', token, () => {
            const analysis = analyzeHeaders(document, deps);
            if (analysis === undefined) return undefined;
            const offset = document.offsetAt(position);
            const found = hoverAt(analysis.kind, analysis.text, offset);
            if (found === undefined) return codeHover(document, offset, deps.policyFor?.(analysis.path) ?? null);
            return {
              contents: { kind: 'markdown' as const, value: found.markdown },
              range: { start: document.positionAt(found.span.start), end: document.positionAt(found.span.end) },
            };
          });
        },

        provideCodeActions(document, range, _context, token) {
          return run('codeActions', token, () => {
            const analysis = analyzeHeaders(document, deps);
            if (analysis === undefined) return undefined;
            const start = document.offsetAt(range.start);
            const end = document.offsetAt(range.end);
            const config = deps.configFileFor?.(analysis.path);
            const said = shown(analysis);
            const file = { uri: document.uri, path: analysis.path, text: analysis.text, ...(config === undefined ? {} : { config }) };
            return [
              ...headersActions({ uri: document.uri, ...analysis }, said, start, end),
              ...hashFileActions(file, said, start, end),
              ...explainActions(analysis.found, start, end),
            ];
          });
        },
      };
    },
  };
}
