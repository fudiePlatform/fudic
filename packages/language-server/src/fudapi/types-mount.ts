/**
 * The `.fudic/api/<id>.d.ts` this server writes, served to the TypeScript of the project as
 * written (SDD-60 §4.9, Invalidación).
 *
 * Volar's project caches the disk and learns of a change only from the client's watcher, which
 * does not watch `.fudic/`. So the types of a saved `.fudapi` reached the disk and never the
 * program: the `.fud` that links it kept the old `data`. Patched in place, as `mountGlobals`
 * is, and read lazily: a write bumps the project's version, the program asks again, and a file
 * written for a new `.fudapi` enters the program with no restart.
 */

import type ts from 'typescript';
import { snapshotOf } from '@fudic/typecheck';
import type { ApiHost } from './host.js';

export type ApiTypesHost = Pick<
  ts.LanguageServiceHost,
  'getScriptFileNames' | 'getScriptSnapshot' | 'getScriptVersion' | 'fileExists' | 'readFile'
> & { getProjectVersion?(): string };

const forward = (path: string): string => path.replace(/\\/g, '/');

export function mountApiTypes(host: ApiTypesHost, apis: Pick<ApiHost, 'written' | 'writtenPaths' | 'revision'>): void {
  const getScriptFileNames = host.getScriptFileNames.bind(host);
  const getScriptSnapshot = host.getScriptSnapshot.bind(host);
  const getScriptVersion = host.getScriptVersion.bind(host);
  const getProjectVersion = host.getProjectVersion?.bind(host);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);

  host.getScriptFileNames = () => {
    const names = getScriptFileNames();
    const listed = new Set(names.map(forward));
    const added = apis.writtenPaths().filter((path) => apis.written(path) !== undefined && !listed.has(path));
    return [...names.filter((name) => apis.written(forward(name)) !== undefined), ...added];
  };
  host.getScriptSnapshot = (name) => {
    const text = apis.written(forward(name));
    return text === null ? getScriptSnapshot(name) : text === undefined ? undefined : snapshotOf(text);
  };
  host.getScriptVersion = (name) =>
    apis.written(forward(name)) === null ? getScriptVersion(name) : `fudapi:${apis.revision}`;
  host.getProjectVersion = () => `${getProjectVersion?.() ?? ''}:fudapi:${apis.revision}`;
  host.fileExists = (name) => {
    const text = apis.written(forward(name));
    return text === null ? fileExists(name) : text !== undefined;
  };
  host.readFile = (name, encoding) => {
    const text = apis.written(forward(name));
    return text === null ? readFile(name, encoding) : text;
  };
}
