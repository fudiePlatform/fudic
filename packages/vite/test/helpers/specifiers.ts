/**
 * Every module specifier a file references — static or dynamic (BUG-03 §6.1).
 *
 * Shared because two BUGs assert the same invariant on the same file: BUG-03 established
 * that `fudic-sw.js` has no imports at all, and BUG-06 has to show that minifying it did
 * not reintroduce one. One predicate, so the second check cannot drift into a weaker
 * version of the first.
 *
 * Each pattern requires a QUOTED specifier: an `import()` written in a JSDoc comment —
 * `@fudic/transport` has one — is prose, not a script graph.
 */
const PATTERNS = [
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu, // dynamic import
  /\bfrom\s*["']([^"']+)["']/gu, // import … from / export … from
  /\bimport\s*["']([^"']+)["']/gu, // bare side-effect import
];

export function specifiersOf(code: string): string[] {
  const found: string[] = [];
  for (const pattern of PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      found.push(match[1]!);
    }
  }
  return found;
}
