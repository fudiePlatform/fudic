/**
 * The walk of a chain (SDD-56 §4.4): `next(ctx)` resolves to what the inside returned, an error
 * is a rejection, and a step may call `next` as many times as it likes. Which steps it walks is
 * the composition of `contract/middleware.ts`.
 */

/** A step of either side, as `run` calls it. */
export type AnyStep = (ctx: never, next: never) => unknown;

export function run<C>(
  steps: readonly AnyStep[],
  ctx: C,
  last: (ctx: C) => unknown,
): Promise<unknown> {
  const at = async (i: number, c: C): Promise<unknown> => {
    const step = steps[i] as ((c: C, next: (n: C) => Promise<unknown>) => unknown) | undefined;
    return step === undefined ? last(c) : step(c, (n) => at(i + 1, n));
  };
  return at(0, ctx);
}
