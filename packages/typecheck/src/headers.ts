/**
 * The three `.headers` of an app as the project check reports them (SDD-84 §3.8, criterion 34): what
 * the build says of them, read by the same `readHeaders`, under the project's policy and each file's
 * own `#` comments, as the build reports them. Not what needs the output — `FUD1545`, `FUD1548`,
 * `FUD1551`–`FUD1553`, `FUD1556` —, which only a build knows.
 */

import { HEADERS_FILES, readHeaders, type HeadersKind, type ProjectPolicies } from '@fudic/config';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import { governFile } from './govern.js';

/** What the check says of the `.headers` of the project at `root`, governed, file by file. */
export function headersDiagnostics(
  root: string,
  readFile: (path: string) => string | undefined,
  policies: ProjectPolicies,
): readonly SourceDiagnostic[] {
  const kind = policies.projectOf(`${root}/fudic.json`)?.config?.kind ?? 'app';
  const io = { exists: (path: string) => readFile(path) !== undefined, read: (path: string) => readFile(path)! };
  const read = readHeaders(root, io, { kind, sw: readFile(`${root}/sw.json`) !== undefined });
  return (Object.keys(HEADERS_FILES) as HeadersKind[]).flatMap((file) => {
    const path = `${root}/${HEADERS_FILES[file]}`;
    const found = read.diagnostics
      .filter((d) => d.file === HEADERS_FILES[file])
      // On the file's full path, so its own comments apply; one with no place, at its start.
      .map((d) => ({ ...d, file: path, span: d.span ?? { start: 0, end: 0 } }));
    return found.length === 0 ? [] : governFile(path, readFile(path)!, found, policies.policyOf(path));
  });
}
