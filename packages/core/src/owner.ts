/**
 * Ownership — who tears down what a component's `@code` created (SDD-68 §3.5).
 *
 * The emit runs the `@code` of a component or a route inside `owned`, and pours the list it
 * hands back into the controller's `$d`. While `fn` runs, every `effect(…)` and every
 * `task(…)` created there leaves its teardown in that list, so removing the component stops
 * them. Anything created later — inside a handler, inside a rerun — finds no owner and lives
 * with the page, exactly as before.
 *
 * One module-level variable, like the tracking context: reentrant, restored in `finally`.
 */

let current: (() => void)[] | null = null;

/** Run `fn`, collecting the teardown of everything it creates. For the emit only. */
export function owned<T>(fn: () => T): readonly [T, readonly (() => void)[]] {
  const previous = current;
  const list: (() => void)[] = [];
  current = list;
  try {
    return [fn(), list];
  } finally {
    current = previous;
  }
}

/** Hand `dispose` to the owner running right now. Outside `owned` it is a no-op. */
export function own(dispose: () => void): void {
  current?.push(dispose);
}
