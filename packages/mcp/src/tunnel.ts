/**
 * A public URL for a chat that connects from the internet: cloudflared's quick tunnel, no account,
 * one command. The URL appears in its output; it changes on every start.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { FUD1406, type ProjectDiagnostic } from '@fudic/diagnostics';

const URL_IN_OUTPUT = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/u;

/** How long cloudflared may take to say its URL before it is given up on. */
const WAIT_MS = 30_000;

export interface Tunnel {
  readonly url: string;
  close(): void;
}

export type TunnelResult =
  | { readonly tunnel: Tunnel }
  /** Not installed. */
  | { readonly missing: ProjectDiagnostic }
  /** It started and failed: what it said last. */
  | { readonly failed: string };

export type Spawn = (command: string, args: readonly string[]) => ChildProcess;

const nodeSpawn: Spawn = (command, args) => spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

export function openTunnel(port: number, start: Spawn = nodeSpawn, waitMs: number = WAIT_MS): Promise<TunnelResult> {
  return new Promise((resolve) => {
    const child = start('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`]);
    let said = '';
    let settled = false;
    const settle = (result: TunnelResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!('tunnel' in result)) child.kill();
      resolve(result);
    };
    const timer = setTimeout(() => settle({ failed: `no URL after ${waitMs / 1000}s:\n${said.trim()}` }), waitMs);
    const listen = (chunk: Buffer): void => {
      said = `${said}${chunk.toString('utf8')}`.slice(-4000);
      const url = URL_IN_OUTPUT.exec(said)?.[0];
      if (url !== undefined) settle({ tunnel: { url, close: () => child.kill() } });
    };
    child.stdout?.on('data', listen);
    child.stderr?.on('data', listen);
    child.on('error', (error: NodeJS.ErrnoException) => {
      settle(error.code === 'ENOENT' ? { missing: FUD1406() } : { failed: error.message });
    });
    child.on('exit', (code) => settle({ failed: `cloudflared exited with ${String(code)}:\n${said.trim()}` }));
  });
}
