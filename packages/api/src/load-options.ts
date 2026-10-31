/**
 * The words of a `load` line (SDD-60 §3.4, SDD-70 §3.9) and the two values that are not words:
 * a duration and a buffer size. The parser reads the line with them, and the editor completes
 * and explains it with the same ones.
 */

export const LOAD_MODES: readonly string[] = ['ssg', 'ssr', 'sw'];
export const LOAD_POLICIES: readonly string[] = ['cache-first', 'network-first', 'stale-while-revalidate', 'network-only'];
/** What `page` takes. */
export const PAGE_CACHES: readonly string[] = ['never', 'persist'];
/** Every option of the line, in the order the grammar writes them. */
export const LOAD_OPTIONS: readonly string[] = [...LOAD_MODES, 'ttl', ...LOAD_POLICIES, 'page', 'buffer'];

/** `0`, `4096`, `16k`: a whole number of bytes, `k` for 1024. */
const BUFFER = /^(0|[1-9][0-9]*)(k)?$/u;

/** The bytes `buffer <text>` asks for, or `undefined` when `text` is no size. */
export function bufferBytes(text: string): number | undefined {
  const m = BUFFER.exec(text);
  return m === null ? undefined : Number(m[1]) * (m[2] === undefined ? 1 : 1024);
}

const UNIT: Readonly<Record<string, number>> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const DURATION = /^(\d+)([smhd])$/u;

/** `5m` in milliseconds, or `undefined` when `text` is no duration. */
export function durationMs(text: string): number | undefined {
  const m = DURATION.exec(text);
  return m === null ? undefined : Number(m[1]) * UNIT[m[2]!]!;
}
