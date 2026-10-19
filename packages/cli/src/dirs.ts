/**
 * The directory names the argument parser needs, in a module that imports nothing (BUG-51):
 * `args.ts` runs on every command, `--help` included, and reaching these through the plans that
 * own them loaded the compiler before the CLI had decided what to do.
 */

/** Where a project keeps its snippet files. */
export const SNIPPETS_DIR = 'src/snippets';

/** The two folders of a workspace: its applications and its libraries. */
export const APPS_DIR = 'apps';
export const LIBS_DIR = 'libs';
