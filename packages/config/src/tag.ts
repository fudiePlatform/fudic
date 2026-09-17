/**
 * The arithmetic of the prefix — and the only place a hyphen is put between the two, which
 * is what makes `app--card` impossible to produce.
 */

/**
 * The tag a bare name produces under `prefix`: `('shop', 'card')` → `'shop-card'`.
 *
 * A name that ALREADY carries a hyphen is a tag the author wrote, and comes back
 * untouched: `('shop', 'signal-counter')` → `'signal-counter'`. So is anything at all
 * when `prefix` is `''`. The prefix proposes; the author disposes (§4.4).
 */
export function tagOf(prefix: string, name: string): string {
  if (prefix === '' || name.includes('-')) {
    return name;
  }
  return `${prefix}-${name}`;
}
