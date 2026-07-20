/**
 * The closed CSS at-rule whitelist (decision 42.a/b), the pivot on which the `@`
 * inside `<style>` is disambiguated: in the list ⇒ literal CSS, out of it ⇒ a
 * Razor atom.
 *
 * Closed on purpose: a new at-rule is a code change, never a heuristic (SDD-09
 * §7). No entry collides with a Razor control keyword, so membership separates
 * the two grammars cleanly.
 */

/**
 * The whitelisted CSS at-rule names, lowercase and WITHOUT the leading `@`.
 * Matching is ASCII case-insensitive (CSS at-rule keywords are).
 */
export const CSS_AT_RULES: ReadonlySet<string> = new Set([
  'charset',
  'import',
  'namespace',
  'media',
  'supports',
  'container',
  'layer',
  'scope',
  'starting-style',
  'keyframes',
  'font-face',
  'font-feature-values',
  'font-palette-values',
  'counter-style',
  'page',
  'property',
  'document',
]);

/**
 * True if `name` — the identifier after `@`, without the `@` — is a whitelisted
 * CSS at-rule. ASCII case-insensitive: `@MEDIA` is CSS, same as `@media`.
 */
export function isCssAtRule(name: string): boolean {
  return CSS_AT_RULES.has(name.toLowerCase());
}

/**
 * The identifier grammar used ONLY for the whitelist probe: `[a-zA-Z][a-zA-Z0-9-]*`.
 * Wider than a JS identifier because at-rule names carry hyphens (`font-face`,
 * `starting-style`), which an implicit Razor expression never does.
 *
 * Returns the end offset of the identifier starting at `from`, or `from` when
 * there is none.
 */
export function atRuleNameEnd(source: string, from: number): number {
  const first = source[from];
  if (first === undefined || !isAsciiLetter(first)) return from;
  let i = from + 1;
  for (;;) {
    const c = source[i];
    if (c === undefined || !(isAsciiLetter(c) || isAsciiDigit(c) || c === '-')) break;
    i++;
  }
  return i;
}

function isAsciiLetter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

function isAsciiDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}
