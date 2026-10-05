/**
 * Running again on save. Vite's watcher says WHAT changed; what to do depends on the file:
 *
 * - a `.fud` (the component or one it links): Vite recompiles, and the first `full-reload` it
 *   sends after the change says it is done — running on the watcher event is a race. When no
 *   reload comes (the change touched nothing the client loads), it runs anyway after a while;
 * - the `.fudspec`, the fixture or a term: the session is loaded again, then it runs.
 *
 * One run at a time: a save during a run leaves ONE run pending, however many saves there were.
 */

import type { BenchTarget } from './target.js';
import { slashes } from './target.js';

export type Change = 'component' | 'session' | 'none';

export interface RerunDeps {
  /** Loads the session again. Must not throw. */
  reload(): Promise<void>;
  /** Runs every criterion. Must not throw. */
  run(): Promise<void>;
  /** How long a `.fud` change waits for Vite's reload; 10 s by default. */
  readonly reloadTimeout?: number;
}

/** What a changed file asks for. The `.fudspec` counts even when the component had none yet. */
export function classify(file: string, target: BenchTarget): Change {
  const path = slashes(file);
  const base = target.component.slice(0, -'.fud'.length);
  if (path === `${base}.fudspec` || path === `${base}.fixture.ts`) return 'session';
  if (path.startsWith(`${target.projectRoot}/fudic/terms/`) && path.endsWith('.js')) return 'session';
  if (path.endsWith('.fud')) return 'component';
  return 'none';
}

export class Rerunner {
  readonly #deps: RerunDeps;
  readonly #timeout: number;
  #busy = false;
  /** The run waiting for the current one; `reload` if any change that asked for it. */
  #pending: { reload: boolean } | undefined;
  /** A `.fud` change waiting for Vite's `full-reload`. */
  #awaiting: ReturnType<typeof setTimeout> | undefined;

  constructor(deps: RerunDeps) {
    this.#deps = deps;
    this.#timeout = deps.reloadTimeout ?? 10_000;
  }

  changed(change: Change): void {
    if (change === 'session') this.request(true);
    else if (change === 'component' && this.#awaiting === undefined) {
      this.#awaiting = setTimeout(() => this.fullReload(), this.#timeout);
    }
  }

  /** Vite sent a `full-reload`: a `.fud` change waiting for it runs now. */
  fullReload(): void {
    if (this.#awaiting === undefined) return;
    clearTimeout(this.#awaiting);
    this.#awaiting = undefined;
    this.request(false);
  }

  /** Runs now, or once the current run ends. */
  request(reload: boolean): void {
    if (this.#busy) {
      this.#pending = { reload: reload || this.#pending?.reload === true };
      return;
    }
    void this.#drain(reload);
  }

  /** Forgets a waiting `.fud` change: the workbench is closing. */
  stop(): void {
    clearTimeout(this.#awaiting);
    this.#awaiting = undefined;
    this.#pending = undefined;
  }

  async #drain(reload: boolean): Promise<void> {
    this.#busy = true;
    if (reload) await this.#deps.reload();
    await this.#deps.run();
    this.#busy = false;
    const next = this.#pending;
    this.#pending = undefined;
    if (next !== undefined) await this.#drain(next.reload);
  }
}

/** The part of Vite's client hot channel the workbench listens to. */
export interface HotChannel {
  send(...args: never[]): void;
}

/** Calls `onReload` on every `full-reload` the channel sends, then sends it. */
export function onFullReload(hot: HotChannel, onReload: () => void): void {
  const send = hot.send.bind(hot) as (...args: unknown[]) => void;
  (hot as { send: (...args: unknown[]) => void }).send = (...args) => {
    const payload = args[0] as { type?: unknown } | string;
    if (typeof payload === 'object' && payload.type === 'full-reload') onReload();
    send(...args);
  };
}
