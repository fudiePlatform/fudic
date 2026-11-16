/**
 * The class list, written token by token.
 *
 * A dynamic class of the view — `class:x=@cond`, `class=@expr`, the `class` of a spread — only
 * puts in and takes out its own tokens, so a class some other code added (a `ref`, a library, an
 * animation) survives every change. ONE pure function decides what a change does, and every
 * adapter applies it: the browser to its `classList`, the server to the attribute it serializes.
 */

/** The ASCII white space a browser splits a class list on. */
const WHITE_SPACE = /[\t\n\f\r ]+/u;

/** The tokens of a class list, in order, without empties or repeats. */
export function classTokens(list: string): string[] {
  return [...new Set(list.split(WHITE_SPACE).filter((token) => token !== ''))];
}

/** What going from the class text `prev` to `next` does to an element's list. */
export interface ClassDiff {
  readonly remove: readonly string[];
  readonly add: readonly string[];
}

/** The tokens of `prev` that `next` no longer has, and the tokens of `next`. */
export function classDiff(next: string, prev: string): ClassDiff {
  const add = classTokens(next);
  return { remove: classTokens(prev).filter((token) => !add.includes(token)), add };
}
