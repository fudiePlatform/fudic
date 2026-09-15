/**
 * `fudic.json` from the build's point of view (SDD-41 §3.3).
 *
 * The plugin reads the project's configuration next to `sw.json` and exposes what needs it
 * — today the `id`, which BUG-33 uses to namespace this application's caches. It is NOT a
 * plugin option and `FudicOptions` does not gain one: the configuration belongs to the
 * project, and a plugin that redefined it would be a second place to declare the same fact.
 *
 * The two severities come straight from §5. A malformed file degrades: the project goes on
 * without configuration, because a configuration error that aborts the build leaves the
 * user without the output that would have told them what they wrote wrong. A `sw.json`
 * with no `id` does not degrade, because there is no correct behaviour to degrade to —
 * the caches would be named after nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import {
  CONFIG_FILE,
  FUD_CONFIG_ID_REQUIRED,
  readProjectConfig,
  type ConfigDiagnostic,
  type ConfigIo,
  type ProjectConfig,
} from '@fudic/config';
import { SW_CONFIG_FILE } from './constants.js';

export interface ProjectResult {
  /** `null` when there is no `fudic.json`, or it is unusable. */
  readonly config: ProjectConfig | null;
  /** Degraded: reported, and the build goes on without configuration (§5). */
  readonly warnings: readonly ConfigDiagnostic[];
  /** Fatal: what these describe has no correct behaviour possible (§5). */
  readonly errors: readonly ConfigDiagnostic[];
}

/** The real filesystem, in the shape the reader asks for. */
export function nodeConfigIo(): ConfigIo {
  return {
    exists: (path) => existsSync(path),
    read: (path) => readFileSync(path, 'utf8'),
  };
}

/**
 * Read `<root>/fudic.json` and decide what is fatal.
 *
 * `hasSw` is whether this build emits a Service Worker, not whether a `sw.json` file is
 * lying around: a malformed one produces no worker at all (SDD-20 §4.7), and a project
 * with no worker has no caches to namespace, so demanding an identity of it would be
 * asking for a value nobody reads.
 */
export function readProject(root: string, hasSw: boolean, io: ConfigIo): ProjectResult {
  const { config, diagnostics } = readProjectConfig(root, io);

  const errors: ConfigDiagnostic[] = [];
  if (hasSw && (config?.id ?? '') === '') {
    errors.push({
      code: FUD_CONFIG_ID_REQUIRED,
      message: `${SW_CONFIG_FILE} is present, so ${CONFIG_FILE} must declare an "id": it is what namespaces this application's caches, and without it two apps on one origin wipe each other's`,
      file: CONFIG_FILE,
    });
  }

  return { config, warnings: diagnostics, errors };
}
