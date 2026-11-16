/**
 * What a level is: a date (SDD-83 §3.5). A key passes a level when it reached every core browser on
 * that date or before. `widely` is the data's date minus 30 months, `newly` the data's date, and a
 * year its last day. The date is the DATA's, never the clock's: the same fudic gives the same answer
 * today and a year from now. Every function takes `asOf` so a test can fix it.
 */

import { AS_OF } from './data.generated.js';

/** A project's Baseline: `widely`, `newly`, or a year. */
export type Target = 'widely' | 'newly' | number;

/** The oldest year a project may ask for: the first year Baseline has a meaning. */
export const FIRST_YEAR = 2015;

/** How long a feature is newly available before it is widely available. */
const WIDELY_MONTHS = 30;

/** The newest year a project may ask for: the data's. */
export function lastYear(asOf: string = AS_OF): number {
  return Number(asOf.slice(0, 4));
}

/** The date a level asks for, `YYYY-MM-DD`. */
export function cutoff(target: Target, asOf: string = AS_OF): string {
  if (target === 'newly') return asOf;
  if (target === 'widely') return addMonths(asOf, -WIDELY_MONTHS);
  return `${target}-12-31`;
}

/** When a key that became newly available on `newly` becomes widely available. */
export function widelyOn(newly: string): string {
  return addMonths(newly, WIDELY_MONTHS);
}

/** The level in words, for a message: `widely available`, `newly available`, `Baseline 2024`. */
export function describeTarget(target: Target): string {
  return typeof target === 'number' ? `Baseline ${target}` : `${target} available`;
}

/**
 * `date` moved by `months`, keeping the day when the month has it and its last day when it does
 * not: 2026-08-31 minus 30 months is 2024-02-29.
 */
function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(day, last))}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
