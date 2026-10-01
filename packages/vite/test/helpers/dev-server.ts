/**
 * The parts of a `ViteDevServer` the plugin's `configureServer` talks to, faked.
 *
 * Since SDD-35 `configureServer` starts the live typecheck, which reads `config.logger`,
 * listens on `watcher` and pushes over `ws` — so every fake server a test hands the plugin
 * needs those three, on top of whatever the test itself is about (`middlewares`,
 * `transformRequest`, …).
 */

import { EventEmitter } from 'node:events';

export interface FakeDevServerParts {
  readonly config: {
    readonly logger: { error(m: string): void; warn(m: string): void; info(m: string): void };
  };
  readonly watcher: EventEmitter;
  readonly ws: { send(payload: unknown): void };
  /** What the server printed and pushed, for a test to read. */
  readonly told: { readonly errors: string[]; readonly warnings: string[]; readonly sent: unknown[] };
}

export function fakeDevServerParts(): FakeDevServerParts {
  const told = { errors: [] as string[], warnings: [] as string[], sent: [] as unknown[] };
  return {
    config: {
      logger: {
        error: (m) => told.errors.push(m),
        warn: (m) => told.warnings.push(m),
        info: () => undefined,
      },
    },
    watcher: new EventEmitter(),
    ws: { send: (payload) => told.sent.push(payload) },
    told,
  };
}
