/**
 * A command line the CLI cannot understand, said the way BUG-50 §6.8 shows it: the message, the
 * lines that say how to go on, and where the help of that command is. Never the whole help: a
 * screen of options buries the one line that says what went wrong.
 */

import type { CliError } from '../types.js';
import type { Topic } from './commands.js';

export interface UsageError {
  readonly error: CliError;
  /** The command whose help explains it; `null` when there is no such command. */
  readonly topic: Topic | null;
  readonly hints: readonly string[];
}

/** What `fudic generate` makes, in the order its help lists them. */
export const GENERATES = 'component, page, layout, app, lib, service, form, style, term';

/** The commands, for an unknown one. */
export const COMMANDS = 'new, generate (g), add, dev, preview, test, spec, fmt, translate';

const INDENT = '       ';

export function formatUsageError(usage: UsageError): string {
  const lines = [`error  ${usage.error.message}`, ...usage.hints.map((hint) => `${INDENT}${hint}`)];
  const help = usage.topic === null ? 'fudic --help' : `fudic ${usage.topic} --help`;
  // The blank line before it parts the error from the command that was typed (§6.8).
  return `\n${lines.join('\n')}\n\n"${help}" for more.\n`;
}
