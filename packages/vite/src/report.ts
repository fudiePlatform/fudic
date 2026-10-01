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
import { format, render, type FudDiagnostic } from '@fudic/diagnostics';
import { relativePath, toPosix, type CheckReport } from '@fudic/typecheck';

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
    }
  }

  /**
   * Report a batch of diagnostics: every warning, then — if there are any — every error in ONE
   * failure, positioned at the first. `module` names the file a diagnostic without a `file` is
   * about.
   */
  report(context: ReportContext, diagnostics: readonly FudDiagnostic[], module?: string): void {
    const errors: FudDiagnostic[] = [];
    for (const diagnostic of diagnostics) {
      const located = locate(diagnostic, module);
      if (located.file !== undefined && located.span !== undefined) {
        const key = keyOf(
          resolve(this.#root, located.file),
          located.span.start,
          located.span.end,
          located.code,
        );
        if (this.#said.has(key)) continue;
        if (this.#remember) this.#said.add(key);
      }
      if (located.severity === 'error') errors.push(located);
      else if (located.severity === 'warning') context.warn(pluginLog(located, this.#root));
    }
    const first = errors[0];
    if (first === undefined) return;
    const log = pluginLog(first, this.#root);
    context.error({
      ...log,
      message: errors.map((error) => pluginLog(error, this.#root).message).join('\n\n'),
    });
  }
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
