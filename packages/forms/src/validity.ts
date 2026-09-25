/**
 * `Validity` — WHAT counts when a view asks whether the form is valid (BUG-42 §4.3).
 *
 * Validity and errors are two different readings. The errors are what the user is SHOWN, and
 * `touched`, `validateOn` and the submit govern them. Validity is whether the current values
 * obey the rules, and it is SILENT: reading it publishes nothing and marks nothing.
 *
 * - `Rules` — every failing rule counts, whether the user has been through the field or not. A
 *   form opened with an empty `required` is invalid from its first frame.
 * - `Interacted` — a control counts once the user has left it or changed it. A form nobody has
 *   touched is valid, so a submit button disabled by `$valid()` is not born grey.
 *
 * One of two, not flags: the two readings exclude each other.
 */
export const Validity = {
  Rules: 0,
  Interacted: 1,
} as const;

/** One of the `Validity` values. */
export type Validity = (typeof Validity)[keyof typeof Validity];

/** What a control follows when neither it nor any form above it chose. */
export const DEFAULT_VALIDITY: Validity = Validity.Interacted;
