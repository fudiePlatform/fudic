/** The examples of the guide, read as the test needs them: each fenced block with its file. */

import { readFileSync } from 'node:fs';
import { TOPICS, guideDir, type Topic } from '../src/guide.js';

export interface Block {
  readonly topic: Topic;
  /** The fence's language: `fud`, `fudapi`, `ts`… */
  readonly lang: string;
  /** Where the block goes in the project, from `path=`; absent for a block that is not a file. */
  readonly path?: string;
  /** The code a `broken=FUDnnnn` block must fail with. */
  readonly broken?: string;
  readonly body: string;
  /** 1-based line of the opening fence. */
  readonly line: number;
}

const FENCE = /^```(\w*)([^\n]*)\n([\s\S]*?)^```$/gmu;

export function guideText(topic: Topic): string {
  return readFileSync(`${guideDir()}${topic}.md`, 'utf8').replace(/\r\n/gu, '\n');
}

export function blocksOf(topic: Topic): readonly Block[] {
  const text = guideText(topic);
  return [...text.matchAll(FENCE)].map((m) => {
    const info = m[2]!;
    const path = /\bpath=(\S+)/u.exec(info)?.[1];
    const broken = /\bbroken=(\S+)/u.exec(info)?.[1];
    return {
      topic,
      lang: m[1]!,
      ...(path !== undefined ? { path } : {}),
      ...(broken !== undefined ? { broken } : {}),
      body: m[3]!,
      line: text.slice(0, m.index).split('\n').length,
    };
  });
}

export const ALL_BLOCKS: readonly Block[] = TOPICS.flatMap((t) => blocksOf(t));

/** The rows of every «Instead of…» table of a topic: the first cell and the last (the codes). */
export function insteadRows(topic: Topic): readonly { readonly instead: string; readonly code: string }[] {
  const rows: { instead: string; code: string }[] = [];
  let inTable = false;
  for (const line of guideText(topic).split('\n')) {
    if (line.startsWith('| Instead of')) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|[-| ]+\|$/u.test(line)) continue;
    // A `\|` inside a cell is a pipe of the code, not a column.
    const cells = line.replace(/\\\|/gu, '\u0000').split('|').slice(1, -1).map((c) => c.trim());
    rows.push({ instead: cells[0]!, code: cells[cells.length - 1]! });
  }
  return rows;
}
