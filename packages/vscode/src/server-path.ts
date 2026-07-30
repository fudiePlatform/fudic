/**
 * Which server binary to launch (SDD-25 §4.1).
 *
 * The order is the contract: the setting first, then the bundled one. `fudic.server.path`
 * exists so the server can be developed without reinstalling the extension, and a setting
 * that silently lost to the bundled copy would make that development quietly meaningless.
 */

import type { FileSystemPort } from './ports.js';

export type ServerSource = 'setting' | 'bundled';

export interface ResolvedServer {
  readonly path: string;
  readonly source: ServerSource;
  /** Set when the setting pointed at something that is not there. */
  readonly warning?: string;
}

export const resolveServerPath = (
  configured: string | null,
  bundled: string,
  fs: FileSystemPort,
): ResolvedServer => {
  if (configured === null) return { path: bundled, source: 'bundled' };
  if (fs.exists(configured)) return { path: configured, source: 'setting' };

  // Falling back rather than failing: a stale `fudic.server.path` — a renamed branch, a
  // cleaned build — must not leave the editor without a server. But it is said out loud,
  // because silently ignoring the setting is how someone spends an afternoon debugging the
  // wrong binary.
  return {
    path: bundled,
    source: 'bundled',
    warning: `fudic.server.path points at "${configured}", which does not exist. Using the bundled server.`,
  };
};
