/**
 * Running again on save. Vite says when it has processed a changed file (`processedChanges`);
 * what to do then depends on the file:
 *
 * - a `.fud` (the component or one it links): Vite already recompiled, so it runs;
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
  #busy = false;
  #stopped = false;
  /** The run waiting for the current one; `reload` if any change that asked for it. */
  #pending: { reload: boolean } | undefined;

  constructor(deps: RerunDeps) {
    this.#deps = deps;
  }

  changed(change: Change): void {
    if (change !== 'none') this.request(change === 'session');
  }

  /** Runs now, or once the current run ends. */
  request(reload: boolean): void {
    if (this.#stopped) return;
    if (this.#busy) {
      this.#pending = { reload: reload || this.#pending?.reload === true };
      return;
    }
    void this.#drain(reload);
  }

  /** Forgets a pending run and refuses new ones: the workbench is closing. */
  stop(): void {
    this.#stopped = true;
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
