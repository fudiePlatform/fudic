/**
 * The implementations of `fudapi/rules.fudapi` (SDD-60 §3.10): today's validators, registered
 * on the pieces the generated module declares. `runs both`, so they live in `browser/` and the
 * server loads them too.
 */

import { max, maxLength, min, minLength, pattern, required } from 'fudic:@fudic/forms/rules';

/** Empty is `null`, and length zero for a text or a list: what `required` rejects. */
const size = (v: string | readonly unknown[] | null): number | null => (v === null || v.length === 0 ? null : v.length);

required.check((v) => v !== '' && v !== null);
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
