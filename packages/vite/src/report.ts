/**
 * The terminal text of a diagnostic: `@fudic/diagnostics`' `format`, given what it needs to say
 * WHERE — the path relative to the project, and the text of the file the span points into, for
 * line, column and the underlined line. The same text everywhere the build reports.
 */

import { readFileSync } from 'node:fs';
import { format, type FudDiagnostic } from '@fudic/diagnostics';

/**
 * `module` is the file being compiled when the diagnostic is about it: a compiler diagnostic
 * leaves `file` absent for "the file being compiled", and the terminal has to name it.
 */
export function reportText(diagnostic: FudDiagnostic, root: string, module?: string): string {
  const located = locate(diagnostic, module);
  const source = located.span !== undefined && located.file !== undefined ? read(located.file) : undefined;
  return format(located, source === undefined ? { root } : { root, source });
}

function locate(diagnostic: FudDiagnostic, module: string | undefined): FudDiagnostic {
  if (diagnostic.file !== undefined || module === undefined || diagnostic.span === undefined) {
    return diagnostic;
  }
  return { ...diagnostic, file: module };
}

/** The file's text, or nothing: a report without its frame is still a report. */
function read(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}
