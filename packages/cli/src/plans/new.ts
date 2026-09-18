/**
 * `fudic new <nombre>` (SDD-22 §6.1): a tree that builds. Layout + root route wired
 * against it with `<link rel="layout">`, the Vite config, and `sw.json` unless `--no-sw` —
 * the Service Worker itself is NOT a user file: the plugin emits `fudic-sw.js`, and the
 * project only declares the policy (SDD-20 §4.7).
 *
 * **Without `--workspace` this command has not changed at all** (SDD-44 §4.2). It is still a
 * standalone project, with its own `tsconfig.json` and its own `fudic-globals.d.ts`, and that
 * is what keeps the one-command start for the case that is still the common one.
 */

import { appFiles, scaffoldChanges, scaffoldRefusal } from './scaffold.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type NewOptions, type Plan, type PlanCommand } from '../types.js';

export function planNew(name: string, opts: NewOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const refused = scaffoldRefusal(name, opts, io);
  if (refused !== null) return Promise.resolve({ ...EMPTY_PLAN, errors: [refused] });

  const { changes, errors } = scaffoldChanges(
    opts,
    appFiles({ dir: name, pkgName: name, up: null, uses: '' }, opts),
    io,
  );

  return Promise.resolve({ ...EMPTY_PLAN, changes, errors, commands: setupCommands(name, opts) });
}

/**
 * The install and the initial commit, as plan commands rather than as side effects: a
 * `--dry-run` that did not list them would describe a command that does more than it says.
 *
 * `-b main`, not a bare `git init`: without it the branch is whatever `init.defaultBranch`
 * happens to be, which is `master` when nobody configured one. The scaffold has an opinion.
 */
export function setupCommands(dir: string, opts: NewOptions): readonly PlanCommand[] {
  const commands: PlanCommand[] = [];
  if (opts.install) commands.push({ command: opts.pm, args: ['install'], dir });
  if (opts.git) {
    commands.push({ command: 'git', args: ['init', '-b', 'main'], dir });
    commands.push({ command: 'git', args: ['add', '-A'], dir });
    commands.push({ command: 'git', args: ['commit', '-m', 'chore: scaffold fudic app'], dir });
  }
  return commands;
}
