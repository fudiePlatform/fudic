/**
 * A throwaway copy of the test project, for the tests that save files: it lives under
 * `test/.tmp/` (inside the package, so `@fudic/core` resolves as it does for the fixture
 * project, and out of git) and carries the example's terms in its own `fudic/terms/`.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BenchMessage, ResultMessage, SessionMessage } from '../../src/protocol.js';
import { slashes } from '../../src/target.js';
import { EXAMPLE_TERMS, PROJECT } from './bench.js';

const TMP = slashes(fileURLToPath(new URL('../.tmp', import.meta.url)));

export interface TempProject {
  readonly root: string;
  /** Absolute path of a file of the project, from a path relative to its root. */
  path(relative: string): string;
  write(relative: string, content: string): void;
  read(relative: string): string;
  remove(): void;
}

let count = 0;

export function tempProject(name: string): TempProject {
  count += 1;
  const root = `${TMP}/${name}-${process.pid}-${count}`;
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  cpSync(PROJECT, root, { recursive: true, filter: (source) => !slashes(source).includes('/node_modules') });
  cpSync(EXAMPLE_TERMS, `${root}/fudic/terms`, { recursive: true });
  const path = (relative: string) => `${root}/${relative}`;
  return {
    root,
    path,
    write(relative, content) {
      writeFileSync(path(relative), content);
    },
    read: (relative) => readFileSync(path(relative), 'utf8'),
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** A shell connected to a workbench: every message it receives, and a way to wait for one. */
export interface Shell {
  readonly messages: BenchMessage[];
  /** Resolves with the first message from `from` on that matches. */
  next<T extends BenchMessage>(match: (m: BenchMessage) => m is T, from?: number, timeout?: number): Promise<T>;
  /** Sends a command as the shell's buttons do. */
  send(command: object): void;
  close(): void;
}

export async function connectShell(url: string): Promise<Shell> {
  const messages: BenchMessage[] = [];
  const socket = new WebSocket(`${url.replace(/^http/u, 'ws')}ws`);
  socket.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data)) as BenchMessage));
  await new Promise((done, fail) => {
    socket.addEventListener('open', done);
    socket.addEventListener('error', fail);
  });
  return {
    messages,
    async next(match, from = 0, timeout = 30_000) {
      const started = Date.now();
      for (;;) {
        const found = messages.slice(from).find(match);
        if (found !== undefined) return found;
        if (Date.now() - started > timeout) {
          throw new Error(`no matching message in ${timeout} ms; got ${JSON.stringify(messages.map((m) => m.type))}`);
        }
        await new Promise((done) => setTimeout(done, 25));
      }
    },
    send: (command) => socket.send(JSON.stringify(command)),
    close: () => socket.close(),
  };
}

/** Every message an `onMessage` receives, and a way to wait for one: a workbench without a shell. */
export interface Inbox {
  readonly messages: BenchMessage[];
  readonly onMessage: (message: BenchMessage) => void;
  next<T extends BenchMessage>(match: (m: BenchMessage) => m is T, from?: number, timeout?: number): Promise<T>;
}

export function inbox(): Inbox {
  const messages: BenchMessage[] = [];
  return {
    messages,
    onMessage: (message) => messages.push(message),
    async next(match, from = 0, timeout = 30_000) {
      const started = Date.now();
      for (;;) {
        const found = messages.slice(from).find(match);
        if (found !== undefined) return found;
        if (Date.now() - started > timeout) {
          throw new Error(`no matching message in ${timeout} ms; got ${JSON.stringify(messages.map((m) => m.type))}`);
        }
        await new Promise((done) => setTimeout(done, 25));
      }
    },
  };
}

export const isState = (m: BenchMessage): m is Extract<BenchMessage, { type: 'state' }> => m.type === 'state';
export const isCancelled = (m: BenchMessage): m is Extract<BenchMessage, { type: 'cancelled' }> => m.type === 'cancelled';
export const runningOf =
  (tag: string) =>
  (m: BenchMessage): m is Extract<BenchMessage, { type: 'running' }> =>
    m.type === 'running' && m.tag === tag;

export const isSession = (m: BenchMessage): m is SessionMessage => m.type === 'session';
export const isRunning = (m: BenchMessage): m is Extract<BenchMessage, { type: 'running' }> => m.type === 'running';
export const resultOf =
  (id: string) =>
  (m: BenchMessage): m is ResultMessage =>
    m.type === 'result' && m.id === id;
