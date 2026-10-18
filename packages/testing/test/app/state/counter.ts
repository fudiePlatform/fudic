/**
 * A module with state, shared by the `state-*.test.ts` files (BUG-51): a worker runs many files,
 * and each of them must meet it fresh, as if it were the only one.
 */

let count = 0;

export function bump(): number {
  count += 1;
  return count;
}
