import { resolve } from 'node:path';
import { HISTORY_EXTENSION } from '@fudic/conventions';
import { formatLine } from './format.js';
import { type HistoryIo, nodeIo } from './io.js';
import { type HistoryEvent, NO_COMMIT } from './types.js';

/** The `.fudlog` of a piece: its `.fud` with the other extension. */
export const historyOf = (unit: string): string => `${unit.replace(/\.fud$/u, '')}${HISTORY_EXTENSION}`;

/** UTC to the minute: `2026-10-22T10:02Z`. */
export const instantOf = (date: Date): string => `${date.toISOString().slice(0, 16)}Z`;

/** Appends one line to the unit's .fudlog, creating it when it does not exist. */
export async function record(unit: string, event: HistoryEvent, io: HistoryIo = nodeIo()): Promise<void> {
  const path = resolve(io.root, historyOf(unit));
  const before = await io.read(path);
  // A history cut without its last line ending (by hand, or by a merge) still gets a line of its own.
  const separator = before !== undefined && before !== '' && !before.endsWith('\n') ? '\n' : '';
  const head = await io.head();
  const commit = head === undefined ? NO_COMMIT : head.slice(0, 7);
  await io.append(path, `${separator}${formatLine({ at: instantOf(io.now()), commit, event })}\n`);
}
