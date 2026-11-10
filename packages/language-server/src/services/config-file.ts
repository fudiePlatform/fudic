/**
 * The diagnostics of a `fudic.json` (SDD-81 criterion 34): what the build says about the file —
 * `FUD0725` for a field of the wrong shape, `FUD1488` for `serve` —, said in the editor while it
 * is written, over the text in the buffer and with the span the reader points at. The same
 * reader as the build and the CLI, so the three say the same thing.
 *
 * Only for a file named `fudic.json`; every other document gets nothing from this service.
 */

import { CONFIG_FILE, readProjectConfig } from '@fudic/config';
import { docsUrl, type FileDiagnostic, type Severity } from '@fudic/diagnostics';
import type { LanguageServicePlugin } from '@volar/language-service';
import { DiagnosticSeverity, type Diagnostic as LspDiagnostic } from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { RequestStats } from '../stats.js';

const SEVERITY: Readonly<Record<Severity, DiagnosticSeverity>> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/** One diagnostic over the document: where the reader points, or the first character when it points nowhere (`not-json`). */
function toLsp(document: TextDocument, d: FileDiagnostic): LspDiagnostic {
  const span = d.span ?? { start: 0, end: 0 };
  return {
    range: { start: document.positionAt(span.start), end: document.positionAt(span.end) },
    severity: SEVERITY[d.severity],
    code: d.code,
    codeDescription: { href: docsUrl(d.code) },
    source: 'fudic',
    message: d.message,
  };
}

/** What the build would say about this `fudic.json`, or `undefined` for any other document. */
export function configDiagnostics(document: TextDocument): LspDiagnostic[] | undefined {
  if (!document.uri.endsWith(`/${CONFIG_FILE}`)) return undefined;
  const text = document.getText();
  const { diagnostics } = readProjectConfig('', { exists: () => true, read: () => text });
  return diagnostics.map((d) => toLsp(document, d));
}

export function createConfigFileService(deps: { readonly stats: RequestStats }): LanguageServicePlugin {
  return {
    name: 'fudic-config',
    capabilities: { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } },
    create() {
      return {
        provideDiagnostics(document, token) {
          return deps.stats.run('diagnostics', token, () => configDiagnostics(document), undefined);
        },
      };
    },
  };
}
