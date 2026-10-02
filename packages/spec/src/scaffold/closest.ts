/**
 * «Did you mean …?» (SDD-53 §4.5). A candidate is offered only when it is close enough to be a
 * typo: at most two edits, and never more than a third of the name, so a short name is not
 * "corrected" into an unrelated one.
 */

/** Levenshtein distance: insertions, deletions and substitutions. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** The candidate closest to `name`, when one is close enough to be a typo; ties go alphabetical. */
export function closest(name: string, candidates: readonly string[]): string | undefined {
  const limit = Math.min(2, name.length / 3);
  let best: { readonly text: string; readonly cost: number } | undefined;
  for (const text of [...candidates].sort()) {
    const cost = distance(name, text);
    if (cost <= limit && (best === undefined || cost < best.cost)) best = { text, cost };
  }
  return best?.text;
}
