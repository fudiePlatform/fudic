/**
 * The ambient declarations, mounted in memory (SDD-24 §2).
 *
 * `GLOBALS_DTS` is the text the projection of SDD-23 is written against — `$text`, `$attrs`,
 * `$section`, `props<T>()`. The CLI writes it to disk so `tsc` and CI see what the editor sees;
 * the server mounts the same constant as a file of the program, so the LSP also works in a
 * project that never ran `fudic new`. One source, two consumers.
 *
 * When the file DOES exist on disk it declares exactly the same names, so mounting it again
 * would be a program with two of everything — TS2300 on every identifier. Hence the check: this
 * is a fallback, not a duplicate.
 */

import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import type * as ts from 'typescript';
import { snapshotOf } from './virtual-code.js';

export { GLOBALS_DTS, GLOBALS_FILE_NAME };

/**
 * Add the ambient declarations to a language service host, unless the project already has them.
 *
 * Patches the host in place: the object belongs to Volar's project, which hands it over live,
 * and wrapping it in a proxy would lose the methods Volar adds afterwards.
 *
 * Returns whether the file was mounted, which is what the log line reports.
 */
export function mountGlobals(host: ts.LanguageServiceHost, root: string): boolean {
  const fileName = `${root}/${GLOBALS_FILE_NAME}`;
  const scriptFileNames = host.getScriptFileNames();
  if (scriptFileNames.some((name) => name.replace(/\\/g, '/').endsWith(GLOBALS_FILE_NAME))) {
    return false;
  }

  const snapshot = snapshotOf(GLOBALS_DTS);
  const getScriptFileNames = host.getScriptFileNames.bind(host);
  const getScriptSnapshot = host.getScriptSnapshot.bind(host);
  const getScriptVersion = host.getScriptVersion.bind(host);
  // `fileExists` and `readFile` are required members of the host, so there is no absent case
  // to defend against — TypeScript itself would not accept a host without them.
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);

  host.getScriptFileNames = () => [...getScriptFileNames(), fileName];
  host.getScriptSnapshot = (name) => (name === fileName ? snapshot : getScriptSnapshot(name));
  // A constant version: the text is compiled in, so it can never change while the server runs.
  host.getScriptVersion = (name) => (name === fileName ? '1' : getScriptVersion(name));
  host.fileExists = (name) => name === fileName || fileExists(name);
  host.readFile = (name, encoding) => (name === fileName ? GLOBALS_DTS : readFile(name, encoding));

  return true;
}
