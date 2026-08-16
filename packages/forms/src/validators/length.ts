/**
 * What `minLength` and `maxLength` share: an EMPTY control is not their business.
 *
 * A rule about size that also complains about emptiness takes `required`'s job,
 * and the visible result is an optional field lighting up before the user has
 * typed a single character. Empty here means `null` — what an untouched control
 * holds — and length zero, which is the same thing written by a string or a list.
 */

export type Sized = string | readonly unknown[];

/** The size to judge, or `null` when there is nothing to judge. */
export const measure = (v: Sized | null): number | null => {
  if (v === null || v.length === 0) {
    return null;
  }
  return v.length;
};
