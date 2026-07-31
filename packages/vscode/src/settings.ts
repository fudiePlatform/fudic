/**
 * The five settings of §3.2, resolved (SDD-25 §3.2).
 *
 * Settings arrive as `unknown`: a user can put a string where a boolean goes, and a
 * workspace file written by hand routinely does. None of that may abort activation — an
 * extension that fails to start because a setting has the wrong type leaves the editor with
 * no colour and no errors, which is the worst outcome §5 names.
 */

import type { ConfigurationPort, TraceLevel } from './ports.js';

export interface FudicSettings {
  /** A server of one's own, for developing the server. `null` means the bundled one. */
  readonly serverPath: string | null;
  readonly trace: TraceLevel;
  readonly templateDiagnostics: boolean;
  readonly formatEnable: boolean;
  readonly exposeVirtualFiles: boolean;
}

const TRACE_LEVELS: readonly TraceLevel[] = ['off', 'messages', 'verbose'];

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asTrace = (value: unknown): TraceLevel =>
  TRACE_LEVELS.find((level) => level === value) ?? 'off';

/** A path setting counts as set only when it is a non-empty string. */
const asPath = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export const readSettings = (config: ConfigurationPort): FudicSettings => ({
  serverPath: asPath(config.get('fudic.server.path')),
  trace: asTrace(config.get('fudic.trace.server')),
  templateDiagnostics: asBoolean(config.get('fudic.templateDiagnostics'), true),
  formatEnable: asBoolean(config.get('fudic.format.enable'), true),
  exposeVirtualFiles: asBoolean(config.get('fudic.exposeVirtualFiles'), false),
});
