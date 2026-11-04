import { HISTORY_EXTENSION } from '@fudic/conventions';
import { formatLine } from './format.js';
import { type HistoryIo, nodeIo } from './io.js';
import { pathOf } from './unit.js';
import { type HistoryEvent, NO_COMMIT } from './types.js';

/** The `.fudlog` of a piece: its `.fud` with the other extension. */
export const historyOf = (unit: string): string => `${unit.replace(/\.fud$/u, '')}${HISTORY_EXTENSION}`;

/** UTC to the minute: `2026-10-22T10:02Z`. */
export const instantOf = (date: Date): string => `${date.toISOString().slice(0, 16)}Z`;

/** The line an event is written as now: this minute and the commit of `HEAD`. */
export async function historyLine(event: HistoryEvent, io: HistoryIo): Promise<string> {
  const head = await io.head();
  const commit = head === undefined ? NO_COMMIT : head.slice(0, 7);
  return formatLine({ at: instantOf(io.now()), commit, event });
}

/**
 * What appending a line to a history adds at its end. A history cut without its last line ending
 * (by hand, or by a merge) gets one first, so the new line is still a line of its own.
 */
export const appendix = (before: string | undefined, line: string): string =>
  `${before !== undefined && before !== '' && !before.endsWith('\n') ? '\n' : ''}${line}\n`;

/** Appends one line to the unit's .fudlog, creating it when it does not exist. */
export async function record(unit: string, event: HistoryEvent, io: HistoryIo = nodeIo()): Promise<void> {
  const path = historyOf(pathOf(unit, io));
  const before = io.fs.readFile(path);
  await io.append(path, appendix(before, await historyLine(event, io)));
}
