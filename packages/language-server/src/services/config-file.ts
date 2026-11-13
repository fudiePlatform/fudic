/**
 * The diagnostics of a `fudic.json` (SDD-81 criterion 34): what the build says about the file —
 * `FUD0725` for a field of the wrong shape, `FUD1488` for `serve` —, said in the editor while it
 * is written, over the text in the buffer and with the span the reader points at. The same
 * reader as the build and the CLI, so the three say the same thing.
 *
 * And what the project as a whole says of its Baseline (SDD-83 §4.1): `FUD1526` for a library
 * that uses what the app does not accept, `FUD1528` for an id of `allow` nothing uses. The check
 * calls the same functions of `@fudic/typecheck` over its program; here they run over the one the
 * editor holds, with the `.fud` as the editor projects them.
 *
 * Only for a file named `fudic.json`; every other document gets nothing from this service.
 */

import { dirname } from 'node:path';
import type * as ts from 'typescript';
import { CONFIG_FILE, readProjectConfig, type ProjectConfig } from '@fudic/config';
import { docsUrl, type FileDiagnostic, type Severity } from '@fudic/diagnostics';
import { findLibraries, type LibraryFs } from '@fudic/resolve';
import {
  governFile,
  packageBaselineUses,
  projectBaselineDiagnostics,
  toPosix,
  type BaselineSite,
  type FudicVirtualCode,
  type ProjectedFud,
} from '@fudic/typecheck';
import type { LanguageServiceContext, LanguageServicePlugin } from '@volar/language-service';
import { DiagnosticSeverity, type Diagnostic as LspDiagnostic } from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { RequestStats } from '../stats.js';
import { uriToPath } from '../uri.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { typeScriptService } from './ts-service.js';

const SEVERITY: Readonly<Record<Severity, DiagnosticSeverity>> = {
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  info: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint,
};

/** What the Baseline of a whole project is read from: the workspace's `.fud` and the disk. */
export interface ConfigProjectDeps {
  readonly index: WorkspaceIndex;
  readonly fs: LibraryFs;
  /** The TypeScript the editor loaded: modules are resolved and folders listed with it. */
  readonly typescript: typeof ts;
}

/** One diagnostic over the document: where the reader points, or the first character when it points nowhere (`not-json`). */
function toLsp(document: TextDocument, d: Omit<FileDiagnostic, 'file'>): LspDiagnostic {
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

const isConfig = (document: TextDocument): boolean => document.uri.endsWith(`/${CONFIG_FILE}`);

/** What the build would say about this `fudic.json`, or `undefined` for any other document. */
export function configDiagnostics(document: TextDocument): LspDiagnostic[] | undefined {
  if (!isConfig(document)) return undefined;
  const text = document.getText();
  const { diagnostics } = readProjectConfig('', { exists: () => true, read: () => text });
  return diagnostics.map((d) => toLsp(document, d));
}

/**
 * `FUD1526` and `FUD1528` of the project this `fudic.json` declares, under its own policy: empty
 * when the file is unusable or the editor holds no program.
 */
export function projectConfigDiagnostics(
  document: TextDocument,
  context: LanguageServiceContext,
  deps: ConfigProjectDeps,
): LspDiagnostic[] {
  const text = document.getText();
  const path = uriToPath(URI.parse(document.uri));
  const root = toPosix(dirname(path));
  const config: ProjectConfig | null = readProjectConfig(root, { exists: () => true, read: () => text }).config;
  const program = typeScriptService(context)?.getProgram();
  if (config === null || program === undefined) return [];

  const fudsOf = (paths: readonly string[]): ProjectedFud[] =>
    paths.flatMap((file) => {
      const root = context.language.scripts.get(URI.file(file))?.generated?.root as FudicVirtualCode | undefined;
      return root === undefined ? [] : [root.document];
    });
  const site: BaselineSite = { typescript: deps.typescript, program, readFile: (file) => deps.fs.readFile(file) };
  const own = deps.index
    .all()
    .filter((entry) => !entry.external && entry.path.startsWith(`${root}/`))
    .map((entry) => entry.path);
  const libraries = findLibraries(root, deps.fs).map((library) => ({
    name: library.name === '' ? library.root : library.name,
    uses: () => packageBaselineUses(site, { root: library.root, config: library.config, fuds: fudsOf(library.files) }),
  }));
  const found = projectBaselineDiagnostics(config, () => packageBaselineUses(site, { root, config, fuds: fudsOf(own) }), libraries);
  // A `fudic.json` has no comments: only its own policy says how these are reported, as in the check.
  const located = found.map((d) => ({ ...d, file: path, span: d.span ?? { start: 0, end: 0 } }));
  return governFile(path, text, located, config.diagnostics).map((d) => toLsp(document, d));
}

export function createConfigFileService(deps: {
  readonly stats: RequestStats;
  /** Absent with no TypeScript: then only the reader speaks. */
  readonly project?: ConfigProjectDeps;
}): LanguageServicePlugin {
  return {
    name: 'fudic-config',
    capabilities: { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } },
    create(context) {
      return {
        provideDiagnostics(document, token) {
          return deps.stats.run(
            'diagnostics',
            token,
            () => {
              const read = configDiagnostics(document);
              if (read === undefined || deps.project === undefined) return read;
              return [...read, ...projectConfigDiagnostics(document, context, deps.project)];
            },
            undefined,
          );
        },
      };
    },
  };
}
