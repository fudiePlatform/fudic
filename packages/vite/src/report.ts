/**
 * How the build tells a diagnostic (SDD-35 §4.4).
 *
 * The terminal text is `@fudic/diagnostics`' `format`, given what it needs to say WHERE — the
 * path relative to the project, and the text of the file the span points into, for line, column
 * and the underlined line. The same text everywhere the build reports.
 *
 * What reaches Vite is a log with `loc` and `frame`, not only a string: that is what puts the
 * position in the terminal and the overlay. And a file's diagnostics go out ALL at once: the
 * warnings one by one, the errors in a single failure — stopping at the first one hides the
 * rest until the next run.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  format,
  render,
  type FudCode,
  type FudDiagnostic,
  type Severity,
  type Span,
  type WireDiagnostic,
} from '@fudic/diagnostics';
import { CONFIG_FILE } from '@fudic/config';
import { echoes, governFile, projectPolicies, relativePath, toPosix, type CheckReport } from '@fudic/typecheck/problems';

/**
 * `module` is the file being compiled when the diagnostic is about it: a compiler diagnostic
 * leaves `file` absent for "the file being compiled", and the terminal has to name it.
 */
export function reportText(diagnostic: FudDiagnostic, root: string, module?: string): string {
  const located = locate(diagnostic, module);
  return format(located, withSource(located, root));
}

/** What Vite and Rollup take for a positioned error or warning. */
export interface PluginLog {
  readonly message: string;
  readonly id?: string;
  readonly loc?: { readonly file: string; readonly line: number; readonly column: number };
  readonly frame?: string;
}

/**
 * A diagnostic as Vite takes it: the head line in `message` (with the link to the code's
 * explanation), and the position and the underlined line in `loc` and `frame`, where the
 * terminal and the overlay put them. The frame is not repeated inside the message.
 */
export function pluginLog(diagnostic: FudDiagnostic, root: string, module?: string): PluginLog {
  const located = locate(diagnostic, module);
  const options = withSource(located, root);
  const shown = render(located, options.source);
  if (located.file === undefined || shown.start === undefined || shown.frame === undefined) {
    return { message: format(located, options) };
  }
  const file = resolve(root, located.file);
  const where = `${relativePath(file, root)}:${shown.start.line}:${shown.start.column}`;
  return {
    message: `${where} - ${shown.severity} ${shown.code}: ${shown.message}\n\n  ${shown.docs}`,
    id: file,
    // 1-based like the message: Vite prints `loc` as it is, and two links to one place that
    // disagree by a column are two places to the person who clicks them.
    loc: { file, line: shown.start.line, column: shown.start.column },
    frame: shown.frame,
  };
}

/** The two methods of a plugin context this module reports through. */
export interface ReportContext {
  warn(log: PluginLog): void;
  error(log: PluginLog): never;
}

/**
 * One reporter per build, shared by the host plugin and its nested passes.
 *
 * Shared because the passes repeat: the host, the link pass and the edge pass compile the same
 * `.fud`, and the typecheck already reported every fudic diagnostic of every file before any of
 * them ran. A diagnostic is said once — the same file, span and code is not said again.
 */
export class BuildReporter {
  readonly #root: string;
  readonly #remember: boolean;
  readonly #said = new Set<string>();
  /** The error spans the check reported, by file: an emit error that meets one says it again. */
  readonly #spoken = new Map<string, Span[]>();

  /**
   * `remember: false` is dev: there a file is compiled again on every save, and a diagnostic
   * remembered from the last save would be skipped while it is still there — an error the
   * module then compiles straight through.
   */
  constructor(root: string, options: { readonly remember: boolean } = { remember: true }) {
    this.#root = root;
    this.#remember = options.remember;
  }

  /** What the typecheck reported: nothing of it is said a second time by the emit. */
  rememberCheck(report: CheckReport): void {
    if (!this.#remember) return;
    for (const problem of report.problems) {
      this.#said.add(keyOf(problem.file, problem.span.start, problem.span.end, problem.code));
      if (problem.severity !== 'error') continue;
      const file = toPosix(problem.file);
      this.#spoken.set(file, [...(this.#spoken.get(file) ?? []), problem.span]);
    }
  }

  /**
   * Report a batch of diagnostics: every warning, then — if there are any — every error in ONE
   * failure, positioned at the first. `module` names the file a diagnostic without a `file` is
   * about.
   */
  report(context: ReportContext, diagnostics: readonly FudDiagnostic[], module?: string): void {
    const errors: FudDiagnostic[] = [];
    for (const located of this.#governed(diagnostics.map((diagnostic) => locate(diagnostic, module)))) {
      if (located.file !== undefined && located.span !== undefined) {
        const file = resolve(this.#root, located.file);
        const key = keyOf(file, located.span.start, located.span.end, located.code);
        if (this.#said.has(key)) continue;
        // One fact, one voice: the check spoke first, at this very place — an error the
        // expansion's code repeats, `FUD0170` over a snippet's substituted argument.
        if (located.severity === 'error' && echoes(located.span, this.#spoken.get(toPosix(file)) ?? [])) continue;
        if (this.#remember) this.#said.add(key);
      }
      if (located.severity === 'error') errors.push(located);
      else if (located.severity === 'warning') context.warn(pluginLog(located, this.#root));
    }
    const first = errors[0];
    if (first === undefined) return;
    const log = pluginLog(first, this.#root);
    const message = errors.map((error) => pluginLog(error, this.#root).message).join('\n\n');
    // An Error, not a bare log: what Vite throws is this very object, and whoever catches it —
    // a test that imported the `.fud`, the workbench — reads every error from `fudic`.
    const error: FudicCompileError = Object.assign(new Error(message), {
      ...log,
      message,
      fudic: { diagnostics: errors.map((e) => wireOf(e, this.#root)) },
    });
    context.error(error);
  }

  /**
   * What a person is shown of a batch: each file's diagnostics under the policy of the project it
   * belongs to and its own `fud-disable` comments — the same answer the check and the editor
   * give. A library's warnings, infos and hints are left to whoever develops it, who can fix them;
   * its errors break the app, and are said.
   *
   * The `fudic.json` are read again on every batch, so editing one under `vite dev` takes effect
   * on the next compile. A batch of errors only is passed as it is: an error obeys no policy.
   */
  #governed(diagnostics: readonly FudDiagnostic[]): readonly FudDiagnostic[] {
    if (diagnostics.every((d) => d.severity === 'error')) return diagnostics;
    const policies = projectPolicies(read);
    const app = policies.projectOf(resolve(this.#root, CONFIG_FILE));
    const groups = new Map<string, FudDiagnostic[]>();
    for (const diagnostic of diagnostics) {
      const key = diagnostic.file === undefined ? '' : resolve(this.#root, diagnostic.file);
      groups.set(key, [...(groups.get(key) ?? []), diagnostic]);
    }
    const out: FudDiagnostic[] = [];
    for (const [file, group] of groups) {
      if (file === '' || group.every((d) => d.severity === 'error')) {
        out.push(...(file === '' ? governFile('', '', group, app?.config?.diagnostics ?? null) : group));
        continue;
      }
      const project = policies.projectOf(file);
      if (project !== null && project.root !== app?.root && project.config?.kind === 'lib') {
        out.push(...group.filter((d) => d.severity === 'error'));
        continue;
      }
      // Each one located at the file's whole path: a diagnostic of a file read relative to the
      // root (`page.headers`) is that file's, and its own `fud-disable` comments govern it.
      const located = group.map((d) => ({ ...d, file }));
      out.push(...governFile(file, read(file) ?? '', located, project?.config?.diagnostics ?? null));
    }
    return out;
  }
}

/** The error a `.fud` that does not compile throws: its text as always, and every error as data. */
export interface FudicCompileError extends Error {
  readonly fudic: { readonly diagnostics: readonly WireDiagnostic[] };
}

/** Whether a caught error is a `.fud` that did not compile. */
export function isFudicCompileError(error: unknown): error is FudicCompileError {
  if (!(error instanceof Error) || !('fudic' in error)) return false;
  const fudic = error.fudic;
  return typeof fudic === 'object' && fudic !== null && 'diagnostics' in fudic && Array.isArray(fudic.diagnostics);
}

/** A head line of the message, as `pluginLog` writes it: `<file>:<line>:<column> - <severity> <code>: <message>`. */
const HEAD = /^(.+?):(\d+):(\d+) - (error|warning|info|hint) (FUD\d{4}): (.*)$/gmu;

/**
 * The diagnostics of a `.fud` that did not compile, from whatever reached the caller: the
 * `FudicCompileError` itself, or what is left of it after crossing a process — vitest's module
 * runner keeps the message and drops the rest, and the message says every error in this
 * plugin's own words. Undefined when it is not such an error.
 */
export function compileDiagnosticsOf(error: unknown): readonly WireDiagnostic[] | undefined {
  if (isFudicCompileError(error)) return error.fudic.diagnostics;
  const message = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined;
  if (typeof message !== 'string') return undefined;
  const found = [...message.matchAll(HEAD)].map(
    ([, file, line, column, severity, code, text]): WireDiagnostic => ({
      code: code as FudCode,
      severity: severity as Severity,
      message: text!,
      file: file!,
      line: Number(line),
      column: Number(column),
    }),
  );
  return found.length > 0 ? found : undefined;
}

/** A located diagnostic for a reader: its file relative to the root, line and column 1-based. */
function wireOf(diagnostic: FudDiagnostic, root: string): WireDiagnostic {
  const options = withSource(diagnostic, root);
  const start = render(diagnostic, options.source).start;
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    file: diagnostic.file === undefined ? null : relativePath(resolve(root, diagnostic.file), root),
    line: start?.line ?? null,
    column: start?.column ?? null,
  };
}

function keyOf(file: string, start: number, end: number, code: string): string {
  return `${toPosix(file)}|${start}|${end}|${code}`;
}

function locate(diagnostic: FudDiagnostic, module: string | undefined): FudDiagnostic {
  if (diagnostic.file !== undefined || module === undefined || diagnostic.span === undefined) {
    return diagnostic;
  }
  return { ...diagnostic, file: module };
}

/** The `format` options for a diagnostic: the root, and the file's text when it has a place. */
function withSource(diagnostic: FudDiagnostic, root: string): { root: string; source?: string } {
  // A file the author named in `fudic.json` travels relative to the root; the rest, absolute.
  const source =
    diagnostic.span !== undefined && diagnostic.file !== undefined
      ? read(resolve(root, diagnostic.file))
      : undefined;
  return source === undefined ? { root } : { root, source };
}

/** The file's text, or nothing: a report without its frame is still a report. */
function read(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}
