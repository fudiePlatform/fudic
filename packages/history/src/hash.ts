import { createHash } from 'node:crypto';
import { FIXTURE_EXTENSION, SPEC_EXTENSION } from '@fudic/spec';
import { type HistoryIo, nodeIo } from './io.js';
import { pathOf, relativeTo, stemOf } from './unit.js';

/** How many hex characters of the SHA-256 a line keeps. */
const HASH_LENGTH = 12;

/**
 * The hash of a set of files: each one's path relative to the root, a line break, its text with
 * `LF` endings and a line break, in path order. A file that cannot be read is not in the set.
 */
export function hashFiles(io: HistoryIo, paths: Iterable<string>): string {
  const files = new Map<string, string>();
  for (const path of paths) {
    const text = io.fs.readFile(path);
    if (text !== undefined) files.set(relativeTo(io, path), text.replace(/\r\n/gu, '\n'));
  }
  const hash = createHash('sha256');
  for (const name of [...files.keys()].sort()) hash.update(`${name}\n${files.get(name)}\n`);
  return hash.digest('hex').slice(0, HASH_LENGTH);
}

/** What the user approves: the piece's criteria and the fixture that fixes its props. */
export const approvalFiles = (path: string): readonly string[] => {
  const stem = stemOf(path);
  return [`${stem}${SPEC_EXTENSION}`, `${stem}${FIXTURE_EXTENSION}`];
};

/** The hash of approval, from the files as they are now. */
export async function approvalHash(unit: string, io: HistoryIo = nodeIo()): Promise<string> {
  return hashFiles(io, approvalFiles(pathOf(unit, io)));
}
