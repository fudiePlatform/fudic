/**
 * `ValidateOn` — WHEN a field validates itself, as flags the author combines.
 *
 * The submit always validates: it is the gate that keeps an invalid form from going out, and
 * no policy can turn it off. What the flags add are the moments BEFORE it:
 *
 * - `Blur` — leaving the field validates it.
 * - `Input` — every write validates it, once the user has left the field at least once. Before
 *   that the field is unfilled, not wrong, and nothing is said while it is typed for the first
 *   time.
 *
 * `Submit` is the zero: no moment but the submit. The default is `Blur | Input` — late to
 * accuse, quick to forgive: the error appears when the user is done with the field, and goes
 * (or comes back) at the keystroke that changes it.
 *
 * Flags and not a list of names, so a policy is ONE value that `|` builds and `&` reads, the
 * same in the options of a form and in those of a control.
 */
export const ValidateOn = {
  Submit: 0,
  Blur: 1,
  Input: 2,
} as const;

/** A combination of `ValidateOn` flags: `ValidateOn.Blur | ValidateOn.Input`. */
export type ValidateOn = number;

/** What a control follows when neither it nor any form above it chose. */
export const DEFAULT_VALIDATE_ON: ValidateOn = ValidateOn.Blur | ValidateOn.Input;
