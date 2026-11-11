/**
 * The `.fudapi` of a project, read off the disk: every one of the app under `src/`, and the
 * `fudapi/` folder (and the pipes) of each DIRECT dependency of its `package.json` — one
 * existence check per dependency, `node_modules` is never walked.
 *
 * One reader for the build, the dev server and the project check: what the plugin serves and
 * what the check reports are read from the same files in the same way.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  API_EXTENSION,
  createApiIndex,
  emitDeclarations,
  layoutPropsType,
  parseApi,
  validateApi,
  type ApiContext,
  type ApiIndex,
  type ApiSource,
} from '@fudic/api';
import { API_DIR, API_TYPES_DIR, ERROR_FILE, PIPES_DIR, ROUTES_DIR, SRC_DIR } from '@fudic/conventions';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import { linkedComponentIds } from './spec-reach.js';

export { loadFields } from './load-fields.js';
export { linkedComponentIds, routeParams, specReach, type SpecReachInput } from './spec-reach.js';

/** A dependency that publishes `.fudapi`, and where its compiled implementations are. */
export interface ApiLibrary {
  readonly name: string;
  /** Absolute folder of the package. */
  readonly dir: string;
  /** Its folders, relative to the package: `server` and `browser` unless its `fudic.json` moves them. */
  readonly server: string;
  readonly browser: string;
}

/** Everything read: the sources, their index, what their parse said, and the libraries. */
export interface ApiProjectFiles {
  readonly sources: readonly ApiSource[];
  readonly index: ApiIndex;
  readonly byId: ReadonlyMap<string, ApiSource>;
  readonly byPath: ReadonlyMap<string, ApiSource>;
  readonly parse: ReadonlyMap<ApiSource, readonly SourceDiagnostic[]>;
  readonly libraries: readonly ApiLibrary[];
}

/** What the parser and the validator say about one `.fudapi` of the app. */
export interface ApiFileDiagnostics {
  readonly file: string;
  readonly diagnostics: readonly SourceDiagnostic[];
}

const PARAM = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/u;
const posix = (path: string): string => path.replace(/\\/gu, '/');

/** Read every `.fudapi` of the project at `root`. */
export function readApiProject(root: string): ApiProjectFiles {
  const base = posix(root);
  // A library's own pipes carry its package name in their `<id>`, as its app sees them.
  const own = ownPipes(base);
  const found: { id: string; path: string; origin: ApiSource['origin'] }[] = walk(`${base}/${SRC_DIR}`).map((path) => {
    const id = path.slice(base.length + SRC_DIR.length + 2, -API_EXTENSION.length);
    return { id: own !== undefined && path.startsWith(own.folder) ? `${own.name}/${id}` : id, path, origin: 'app' };
  });
  const libraries: ApiLibrary[] = [];
  for (const name of dependencies(base)) {
    const dir = `${base}/node_modules/${name}`;
    const folders = libraryFolders(dir);
    // A library's pipes (SDD-71 §4.5): what a view of the app imports by the package.
    for (const path of walk(`${dir}/${folders.pipes}`)) {
      const id = path.slice(dir.length + 1, -API_EXTENSION.length).replace(new RegExp(`^${SRC_DIR}/`, 'u'), '');
      found.push({ id: `${name}/${id}`, path, origin: { package: name } });
    }
    const api = `${dir}/${folders.api}`;
    if (!existsSync(api)) continue;
    libraries.push({ name, dir, server: folders.server, browser: folders.browser });
    for (const path of walk(api)) {
      found.push({ id: `${name}/${path.slice(api.length + 1, -API_EXTENSION.length)}`, path, origin: { package: name } });
    }
  }
  const parse = new Map<ApiSource, readonly SourceDiagnostic[]>();
  const sources = found.map((f) => {
    const result = parseApi(readFileSync(f.path, 'utf8'));
    const source: ApiSource = { ...f, file: result.value };
    parse.set(source, result.diagnostics);
    return source;
  });
  return {
    sources,
    index: createApiIndex(sources),
    byId: new Map(sources.map((s) => [s.id, s])),
    byPath: new Map(sources.map((s) => [s.path, s])),
    parse,
    libraries,
  };
}

/** Whether a `.fudapi` is the sibling of a route, its parameters and its URL pattern. */
export function apiContextOf(root: string, source: ApiSource): ApiContext {
  const base = posix(root);
  const routes = `${base}/${ROUTES_DIR}/`;
  const page = `${source.path.slice(0, -API_EXTENSION.length)}.fud`;
  if (source.origin !== 'app' || !source.path.startsWith(routes) || !existsSync(page)) return {};
  const segments = page.slice(routes.length, -'.fud'.length).split('/');
  const params = segments.map((s) => PARAM.exec(s)?.[1]).filter((p): p is string => p !== undefined);
  const error = `${segments[segments.length - 1]}.fud` === ERROR_FILE;
  const pattern = `/${segments.filter((s, i) => !(s === 'index' && i === segments.length - 1)).map((s) => s.replace(PARAM, ':$1')).join('/')}`;
  const text = readFileSync(page, 'utf8');
  const layoutProps = layoutPropsType(page, text, `${base}/${API_TYPES_DIR}/${source.id}.d.ts`);
  // A component's functions are in the `.fudapi` beside its `.fud`, whose `<id>` is its path in `src/`.
  const components = linkedComponentIds(base, page, text, existsSync);
  return {
    route: {
      params,
      pattern,
      ...(error ? { error: true } : {}),
      ...(layoutProps !== undefined ? { layoutProps } : {}),
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

/**
 * Writes `.fudic/api/<id>.d.ts` for every `.fudapi` of the project, and only where the text
 * changed: an unchanged file keeps its date, so the TS server of the editor is not woken.
 * Answers the paths written. The check reads these types, so whoever checks writes them first.
 */
export function writeApiDeclarations(root: string, files: ApiProjectFiles = readApiProject(root)): readonly string[] {
  const base = posix(root);
  const written: string[] = [];
  for (const source of files.sources) {
    const target = `${base}/${API_TYPES_DIR}/${source.id}.d.ts`;
    const text = emitDeclarations(source, files.index, apiContextOf(base, source));
    if (existsSync(target) && readFileSync(target, 'utf8') === text) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    written.push(target);
  }
  return written;
}

/** What the parser and the validator say about every `.fudapi` of the app, by file. */
export function apiDiagnostics(root: string, files: ApiProjectFiles = readApiProject(root)): readonly ApiFileDiagnostics[] {
  return files.sources
    .filter((s) => s.origin === 'app')
    .map((s) => ({ file: s.path, diagnostics: [...files.parse.get(s)!, ...validateApi(s, files.index, apiContextOf(root, s))] }))
    .filter((f) => f.diagnostics.length > 0);
}

/**
 * Where a library keeps its `.fudapi` and its compiled implementations (SDD-60 §3.10):
 * `fudapi/`, `server/` and `browser/` at its root unless its `fudic.json` says otherwise. The
 * defaults of a library are its root folders, not the `src/server` of an app, because what it
 * publishes is compiled.
 */
function libraryFolders(dir: string): {
  readonly api: string;
  readonly server: string;
  readonly browser: string;
  readonly pipes: string;
} {
  const config = configOf(dir);
  const text = (key: string, fallback: string): string => (typeof config[key] === 'string' ? (config[key] as string) : fallback);
  return { api: text('api', API_DIR), server: text('server', 'server'), browser: text('browser', 'browser'), pipes: text('pipes', PIPES_DIR) };
}

/** A project's `fudic.json` as written, `{}` when it has none or it does not parse. */
function configOf(dir: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(`${dir}/fudic.json`, 'utf8')) as Record<string, unknown>;
  } catch {
    return {}; // without a readable `fudic.json`, the defaults
  }
}

/**
 * In a library, its folder of pipes and its package name (SDD-71 §4.5): its pipes are
 * `fudic:<package>/pipes/<name>` in its own project too, so the implementation it publishes
 * imports the same `<id>` its apps know it by. `undefined` in an app.
 */
function ownPipes(root: string): { readonly folder: string; readonly name: string } | undefined {
  const config = configOf(root);
  if (config['kind'] !== 'lib') return undefined;
  let name: unknown;
  try {
    name = (JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as { name?: unknown }).name;
  } catch {
    return undefined; // a library with no readable `package.json` has no name to publish under
  }
  if (typeof name !== 'string') return undefined;
  const pipes = typeof config['pipes'] === 'string' ? config['pipes'] : PIPES_DIR;
  return { folder: `${root}/${pipes}/`, name };
}

/** Every `.fudapi` under a folder, `node_modules` and dot folders left out. */
function walk(folder: string): string[] {
  if (!existsSync(folder)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.name.endsWith(API_EXTENSION)) out.push(path);
  }
  return out.sort();
}

/** The direct dependencies of the app, by its `package.json`. */
function dependencies(root: string): readonly string[] {
  try {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as { dependencies?: object; devDependencies?: object };
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  } catch {
    return []; // no `package.json`, or one that does not parse: no dependencies to read
  }
}
