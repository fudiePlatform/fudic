/**
 * Phase timings for the measurement branch. Printed to stderr with a `[fudic:t]` prefix.
 */

const totals = new Map<string, { ms: number; count: number }>();

/** Print the time since `start` under `label`, and return a new start. */
export function lap(label: string, start: number): number {
  const now = performance.now();
  process.stderr.write(`[fudic:t] ${label.padEnd(40)} ${(now - start).toFixed(0).padStart(6)} ms\n`);
  return now;
}

/** Accumulate the time since `start` under `label`, for hooks that run once per module. */
export function add(label: string, start: number): void {
  const entry = totals.get(label) ?? { ms: 0, count: 0 };
  entry.ms += performance.now() - start;
  entry.count += 1;
  totals.set(label, entry);
}

/** Print and clear every accumulated total. */
export function flush(): void {
  for (const [label, { ms, count }] of totals) {
    process.stderr.write(`[fudic:t] ${label.padEnd(40)} ${ms.toFixed(0).padStart(6)} ms  (${count} calls)\n`);
  }
  totals.clear();
}
