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
  /**
   * Runs the criteria `ids` — every one when undefined; `trigger` is the saved file, or null.
   * Must not throw.
   */
  run(trigger: string | null, ids: readonly string[] | undefined): Promise<void>;
}

/**
 * What a changed file asks of one component. `reads` are the `.fud` files it reads
 * (`componentFiles`); the `.fudspec` and the fixture count even when they do not exist yet, and
 * a term counts for every component, because a term that was missing may be the one just written.
 */
export function classify(file: string, target: BenchTarget, reads: ReadonlySet<string>): Change {
  const path = slashes(file);
  const base = target.component.slice(0, -'.fud'.length);
  if (path === `${base}.fudspec` || path === `${base}.fixture.ts`) return 'session';
  if (path.startsWith(`${target.projectRoot}/fudic/terms/`) && path.endsWith('.js')) return 'session';
  if (reads.has(path)) return 'component';
  return 'none';
}

interface Pending {
  readonly reload: boolean;
  readonly trigger: string | null;
  /** Undefined: every criterion. */
  readonly ids: readonly string[] | undefined;
}

/** Two selections as one: every criterion if either asked for every one, else both lists. */
function union(a: readonly string[] | undefined, b: readonly string[] | undefined): readonly string[] | undefined {
  if (a === undefined || b === undefined) return undefined;
  return [...new Set([...a, ...b])];
}

export class Rerunner {
  readonly #deps: RerunDeps;
  #busy = false;
  #stopped = false;
  /** The run waiting for the current one; `reload` if any change asked for it, the last trigger. */
  #pending: Pending | undefined;

  constructor(deps: RerunDeps) {
    this.#deps = deps;
  }

  /** A change that asks for something: reload (or not) and run `ids`, every criterion by default. */
  changed(change: Change, file: string, ids?: readonly string[]): void {
    if (change !== 'none') this.request(change === 'session', file, ids);
  }

  /** Runs now, or once the current run ends. */
  request(reload: boolean, trigger: string | null = null, ids?: readonly string[]): void {
    if (this.#stopped) return;
    if (this.#busy) {
      const pending = this.#pending;
      this.#pending =
        pending === undefined
          ? { reload, trigger, ids }
          : { reload: reload || pending.reload, trigger: trigger ?? pending.trigger, ids: union(ids, pending.ids) };
      return;
    }
    void this.#drain({ reload, trigger, ids });
  }

  /** Forgets a pending run and refuses new ones: the workbench is closing. */
  stop(): void {
    this.#stopped = true;
    this.#pending = undefined;
  }

  async #drain(run: Pending): Promise<void> {
    this.#busy = true;
    if (run.reload) await this.#deps.reload();
    await this.#deps.run(run.trigger, run.ids);
    this.#busy = false;
    const next = this.#pending;
    this.#pending = undefined;
    if (next !== undefined) await this.#drain(next);
  }
}
