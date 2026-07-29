/**
 * The URI ↔ path boundary (SDD-24 §4.5).
 *
 * Volar keys scripts by `URI`; the workspace index and the virtual names of SDD-23 are paths.
 * Both conversions live here so that no other module has to remember which side it is on —
 * and so the POSIX normalization the index depends on happens exactly once.
 */

import { URI } from 'vscode-uri';
import { toPosix } from './paths.js';

/** The path a document URI points at, POSIX-shaped. */
export function uriToPath(uri: URI): string {
  return toPosix(uri.fsPath);
}

/** The URI of a path. */
export function pathToUri(path: string): URI {
  return URI.file(path);
}

/** Whether a URI names a `.fud`. */
export function isFudUri(uri: URI): boolean {
  return uri.path.endsWith('.fud');
}
