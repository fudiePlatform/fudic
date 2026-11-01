/** Why an instance came up: the `from` of `fud:hydrated`. */
export type HydratedFrom = 'downloaded' | 'shared-chunk' | 'bus' | 'subtree';

export type ReportHydrated = (id: number, tag: string, ms: string, from: HydratedFrom) => void;

/** Milliseconds since it was started, with one decimal: the `ms` of `fud:hydrated`. */
export function stopwatch(): () => string {
  const start = performance.now();
  return () => (performance.now() - start).toFixed(1);
}
