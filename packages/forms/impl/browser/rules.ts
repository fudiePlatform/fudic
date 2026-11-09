/**
 * The implementations of `fudapi/rules.fudapi` (SDD-60 §3.10): today's validators, registered
 * on the pieces the generated module declares. `runs both`, so they live in `browser/` and the
 * server loads them too.
 */

import { accepted, withinSize, type Files } from '@fudic/forms/contract';
import { accept, max, maxLength, maxSize, min, minLength, pattern, required } from 'fudic:@fudic/forms/rules';

/** Empty is `null`, and length zero for a text or a list: what `required` rejects. */
const size = (v: string | readonly unknown[] | null): number | null => (v === null || v.length === 0 ? null : v.length);

// The empty list too: a `file[]` with nothing chosen is `[]` (SDD-81 §3.2).
required.check((v) => v !== '' && v !== null && !(Array.isArray(v) && v.length === 0));
min.check((v, { n }) => v === null || v >= n);
max.check((v, { n }) => v === null || v <= n);
minLength.check((v, { n }) => {
  const length = size(v as string | readonly unknown[] | null);
  return length === null || length >= n;
});
maxLength.check((v, { n }) => {
  const length = size(v as string | readonly unknown[] | null);
  return length === null || length <= n;
});
pattern.check((v, { regex }) => v === null || v === '' || regex.test(v));
// Each file of a `file[]` on its own, never the sum; an empty field is `required`'s (SDD-81 §3.2).
maxSize.check((v, { n }) => withinSize(v as Files, n));
accept.check((v, { types }) => accepted(v as Files, types));
