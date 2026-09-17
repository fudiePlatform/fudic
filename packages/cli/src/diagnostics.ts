/**
 * The CLI's own error catalogue (SDD-22 §3.3): FUD0440–FUD0459. SDD-21 reaches FUD0436,
 * so the range is free. These are `CliError`s, not `Diagnostic`s: none of them has a
 * source span — a collision or a bad `argv` is not a place in a file.
 */

import type { CliError, CommandFailure } from './types.js';

export const FUD_TAG_INVALID = 'FUD0440';
export const FUD_TAG_EXISTS = 'FUD0441';
export const FUD_TAG_RESERVED = 'FUD0442';
export const FUD_TARGET_EXISTS = 'FUD0443';
export const FUD_WIRE_TARGET_MISSING = 'FUD0444';
export const FUD_WIRE_TARGET_BROKEN = 'FUD0445';
export const FUD_SECTION_UNKNOWN = 'FUD0446';
export const FUD_ADAPTER_UNAVAILABLE = 'FUD0447';
export const FUD_USAGE = 'FUD0448';
export const FUD_LAYOUT_INVALID = 'FUD0449';

/** `fudic fmt`: a file that does not parse. Reported, and left exactly as it was (SDD-26 §4.6). */
export const FUD_FORMAT_UNPARSEABLE = 'FUD0450';

/** A command of the plan that exited non-zero, or that could not be started at all. */
export const FUD_COMMAND_FAILED = 'FUD0451';

/*
 * The workspace range, FUD0780–FUD0799 (SDD-44 §5). Span-less like the rest of this file:
 * none of them is a place in a source file — they are about directories, names and the
 * shape of a monorepo.
 *
 * FUD0786 is RESERVED AND DELIBERATELY UNUSED. It was "`fudic g lib` without `--prefix`" in
 * a draft. The prefix is optional and it is a guide (SDD-41 §4.4): no command requires it.
 */

/** `fudic g app` / `fudic g lib` outside a workspace: no `pnpm-workspace.yaml` at or above. */
export const FUD_NOT_A_WORKSPACE = 'FUD0780';

/** No target project: neither `--project`, nor a `fudic.json` at or above `--cwd`. */
export const FUD_NO_TARGET_PROJECT = 'FUD0781';

/** `--project <n>` names no project of the workspace. The message lists the ones there are. */
export const FUD_PROJECT_UNKNOWN = 'FUD0782';

/** `fudic g page` aimed at a `kind: "lib"` project. A library has no routes. */
export const FUD_ROUTE_IN_LIB = 'FUD0783';

/** A project already exists in that directory, or under that name. Without `--force`. */
export const FUD_PROJECT_EXISTS = 'FUD0784';

/** `--uses <x>` names something that is not a workspace library: absent, or an app. */
export const FUD_USES_NOT_A_LIB = 'FUD0785';

/** Build a `CliError`, omitting `file` when absent (exactOptionalPropertyTypes). */
export function cliError(code: string, message: string, file?: string): CliError {
  return file === undefined ? { code, message } : { code, message, file };
}

/**
 * The command failed, said in the two ways it can fail.
 *
 * A `null` status is a process that never started — the binary is not on the PATH — and
 * saying "exited with null" would send the user looking for a bug in a tool that was never
 * there. The command is echoed whole so it can be re-run by hand.
 */
export function commandFailed(failure: CommandFailure): CliError {
  const line = [failure.command.command, ...failure.command.args].join(' ');
  return cliError(
    FUD_COMMAND_FAILED,
    failure.status === null
      ? `could not run \`${line}\`: is it installed and on your PATH?`
      : `\`${line}\` exited with code ${failure.status}`,
  );
}
