/**
 * `fudic.json` from the build's point of view (SDD-41 §3.3).
 *
 * The plugin reads the project's configuration next to `sw.json` and exposes what needs it
 * — today the `id`, which BUG-33 uses to namespace this application's caches. It is NOT a
 * plugin option and `FudicOptions` does not gain one: the configuration belongs to the
 * project, and a plugin that redefined it would be a second place to declare the same fact.
 *
 * Both are errors. A malformed file (`FUD0725`) is the same error here as in the CLI: one code,
 * one severity, wherever it is caught (SDD-50). A `sw.json` with no `id` has no correct
 * behaviour to degrade to either — the caches would be named after nothing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { CONFIG_FILE, readProjectConfig, type ConfigIo, type ProjectConfig } from '@fudic/config';
import { FUD0726, type FileDiagnostic } from '@fudic/diagnostics';

export interface ProjectResult {
  /** `null` when there is no `fudic.json`, or it is unusable. */
  readonly config: ProjectConfig | null;
  /** Fatal: a malformed `fudic.json`, or what has no correct behaviour possible (§5). */
  readonly errors: readonly FileDiagnostic[];
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

  const errors: FileDiagnostic[] = [...diagnostics];
  if (hasSw && (config?.id ?? '') === '') {
    errors.push(FUD0726({ file: CONFIG_FILE }));
  }

  return { config, errors };
}
