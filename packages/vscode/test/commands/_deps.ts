/**
 * A command's world, doubled.
 *
 * Each command is asserted twice, in the two states that matter: with the server up, and
 * with it gone. The second one is not an edge case — it is the state the user is in when
 * they reach for these commands at all.
 */

import type { CommandDeps } from '../../src/commands/index.js';
import type { FudicSession } from '../../src/activate.js';
import type { FudicSettings } from '../../src/settings.js';
import type { CommentSelection, LineReplacement } from '../../src/ports.js';

export interface CommandRecording {
  readonly warnings: string[];
  readonly log: string[];
  readonly opened: { name: string; languageId: string; text: string }[];
  readonly requests: { method: string; params: unknown }[];
  readonly formatted: number[];
  readonly restarts: number[];
  /** Every line replacement the comment toggle asked for. */
  readonly replacements: LineReplacement[];
}

export interface CommandFixture {
  readonly deps: CommandDeps;
  readonly recording: CommandRecording;
}

export const commandFixture = (options: {
  running?: boolean;
  activeUri?: string | undefined;
  formatEnable?: boolean;
  /** What `sendRequest` resolves to, by method. */
  answers?: Record<string, unknown>;
  /** Methods whose request rejects, as a dying server's would. */
  rejects?: readonly string[];
  /** Whether `restart()` reports the server as up afterwards. */
  restartSucceeds?: boolean;
  /** What the editor says is selected. Absent means the focus is not on a `.fud`. */
  selection?: CommentSelection;
}): CommandFixture => {
  const running = options.running ?? true;
  const answers = options.answers ?? {};
  const rejects = options.rejects ?? [];

  const warnings: string[] = [];
  const log: string[] = [];
  const opened: { name: string; languageId: string; text: string }[] = [];
  const requests: { method: string; params: unknown }[] = [];
  const formatted: number[] = [];
  const restarts: number[] = [];
  const replacements: LineReplacement[] = [];

  const settings: FudicSettings = {
    serverPath: null,
    trace: 'off',
    templateDiagnostics: true,
    formatEnable: options.formatEnable ?? true,
    exposeVirtualFiles: false,
  };

  const session = {
    running,
    settings,
    client: {
      start: async () => undefined,
      stop: async () => undefined,
      sendRequest: async <T>(method: string, params: unknown): Promise<T> => {
        requests.push({ method, params });
        if (rejects.includes(method)) throw new Error('connection closed');
        return answers[method] as T;
      },
    },
    restart: async () => {
      restarts.push(restarts.length + 1);
      return options.restartSucceeds ?? true;
    },
  } as unknown as FudicSession;

  return {
    deps: {
      session,
      editor: { activeFudUri: () => options.activeUri },
      documents: {
        openReadOnly: async (name, languageId, text) => {
          opened.push({ name, languageId, text });
        },
      },
      formatter: {
        formatActiveDocument: async () => {
          formatted.push(formatted.length + 1);
        },
      },
      notifications: { warn: (message) => warnings.push(message) },
      logger: { info: (message) => log.push(message) },
      selection: {
        current: () => options.selection,
        replaceLines: async (replacement) => {
          replacements.push(replacement);
        },
      },
    },
    recording: { warnings, log, opened, requests, formatted, restarts, replacements },
  };
};
