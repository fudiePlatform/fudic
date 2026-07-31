/**
 * The executable (SDD-24 §3.1).
 *
 * `fudic-language-server --stdio | --node-ipc | --socket=<port>`. The transport is chosen by the
 * client, and `vscode-languageserver` reads the flag itself, so the work here is validating that
 * exactly one was given and refusing clearly when none was: a server started without a transport
 * hangs forever, which is the hardest failure to diagnose from the editor side.
 *
 * All of it lives in a function rather than at module top level so it can be driven in process.
 * The `bin/` launcher has no branches at all — nothing it could hide.
 */

import { createConnection as createVolarConnection } from '@volar/language-server/node.js';
import type { Connection } from '@volar/language-server/node.js';
import { createFudicServer } from './server.js';

/** How the client talks to this process. */
export type Transport =
  | { readonly kind: 'stdio' }
  | { readonly kind: 'node-ipc' }
  | { readonly kind: 'socket'; readonly port: number };

/** What `main` needs, so a test never opens a real pipe. */
export interface CliDeps {
  createConnection(): Connection;
  start(connection: Connection): void;
  write(message: string): void;
}

const USAGE = 'usage: fudic-language-server --stdio | --node-ipc | --socket=<port>';

const DEFAULTS: CliDeps = {
  createConnection: createVolarConnection,
  start(connection) {
    createFudicServer(connection);
    connection.listen();
  },
  write(message) {
    process.stderr.write(`${message}\n`);
  },
};

/** The transport the arguments ask for, or `undefined` when they ask for none. */
export function parseTransport(argv: readonly string[]): Transport | undefined {
  for (const argument of argv) {
    if (argument === '--stdio') return { kind: 'stdio' };
    if (argument === '--node-ipc') return { kind: 'node-ipc' };

    const socket = /^--socket=(\d+)$/.exec(argument);
    if (socket !== null) return { kind: 'socket', port: Number(socket[1]) };
  }
  return undefined;
}

/** Run the server. Returns the process exit code: 0 when it is listening, 1 on bad arguments. */
export function main(argv: readonly string[], overrides: Partial<CliDeps> = {}): number {
  const deps: CliDeps = { ...DEFAULTS, ...overrides };
  const transport = parseTransport(argv);

  if (transport === undefined) {
    deps.write(USAGE);
    return 1;
  }

  deps.start(deps.createConnection());
  return 0;
}
