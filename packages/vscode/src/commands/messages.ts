/**
 * What the commands say when they cannot do the thing (SDD-25 §4.3).
 *
 * Gathered in one file because every one of them is the same decision: a command invoked in
 * a state where it makes no sense must say so, not fail silently. A palette command that
 * appears to do nothing is indistinguishable from a broken extension.
 */

export const NO_ACTIVE_FUD = 'Fudic: this command needs an active .fud file.';

export const SERVER_DOWN =
  'Fudic: the language server is not running. Run "Fudic: Restart Language Server".';

export const RESTART_FAILED =
  'Fudic: the language server did not start. See the Fudic output channel for why.';

export const NO_VIRTUAL_FILES =
  'Fudic: the server returned no virtual files for this document.';

export const FORMAT_DISABLED = 'Fudic: formatting is off — see the "fudic.format.enable" setting.';

/** The reply when a request dies with the server that was answering it. */
export const requestFailed = (method: string, error: unknown): string =>
  `Fudic: the ${method} request failed: ${String(error)}`;
