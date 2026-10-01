/**
 * What is left of the CLI's own error catalogue once its codes moved to `@fudic/diagnostics`
 * (SDD-50): `FUD0440`–`FUD0451`, `FUD0780`–`FUD0785` and the shared `FUD0761` are made by
 * calling their code there.
 *
 * FUD0786 is RESERVED AND DELIBERATELY UNUSED. It was "`fudic g lib` without `--prefix`" in
 * a draft. The prefix is optional and it is a guide (SDD-41 §4.4): no command requires it.
 */

import { FUD0451 } from '@fudic/diagnostics';
import type { CliError, CommandFailure } from './types.js';

/**
 * The command failed, said in the two ways it can fail.
 *
 * A `null` status is a process that never started — the binary is not on the PATH — and
 * saying "exited with null" would send the user looking for a bug in a tool that was never
 * there. The command is echoed whole so it can be re-run by hand.
 */
export function commandFailed(failure: CommandFailure): CliError {
  const line = [failure.command.command, ...failure.command.args].join(' ');
  return FUD0451({ line, status: failure.status });
}
