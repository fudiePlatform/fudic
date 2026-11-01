import type { Dependency } from '../src/tracking.js';

/** A consumer that records what was reported to it. */
export function recorder(): { seen: Dependency[]; add(dep: Dependency): void } {
  const seen: Dependency[] = [];
  return { seen, add: (dep) => void seen.push(dep) };
}
