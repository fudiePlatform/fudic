/**
 * The `.fudapi` of a project, as the plugin serves them (SDD-60 §3.10, §3.11).
 *
 * One index for the whole project: every `.fudapi` of the app under `src/`, and the `fudapi/`
 * folder of each DIRECT dependency of its `package.json` — one existence check per dependency,
 * `node_modules` is never walked. From it come the three things the plugin hands out:
 *
 *   - the virtual module `fudic:<id>`, in its server or its browser variant;
 *   - `.fudic/api/<id>.d.ts`, written only when its text changes;
 *   - what the compiler is told about a linked file (`LinkedApi`), which keeps it free of
 *     `@fudic/api`.
 *
 * Read once and kept until `invalidate()`: a build reads it once, dev forgets it when a
 * `.fudapi` or the `package.json` changes on disk.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  API_EXTENSION,
  createApiIndex,
  dataShape,
  emitDeclarations,
  emitModule,
  layoutPropsType,
  parseApi,
  validateApi,
  type ApiContext,
  type ApiIndex,
  type ApiSource,
  type Decl,
  type LoadDecl,
  type Side,
} from '@fudic/api';
import type { PageApi } from './analyze.js';
import type { LinkedApi } from '@fudic/compiler';
import { API_DIR, API_TYPES_DIR, ERROR_FILE, FN_PREFIX, ROUTES_DIR, SRC_DIR } from '@fudic/conventions';
import type { SourceDiagnostic } from '@fudic/diagnostics';

/** The scheme of a generated module: `fudic:routes/usuarios`. */
export const API_SCHEME = 'fudic:';

/** A dependency that publishes `.fudapi`, and where its compiled implementations are. */
export interface ApiLibrary {
  readonly name: string;
  /** Absolute folder of the package. */
  readonly dir: string;
  /** Its folders, relative to the package: `server` and `browser` unless its `fudic.json` moves them. */
  readonly server: string;
  readonly browser: string;
}

interface State {
  readonly sources: readonly ApiSource[];
  readonly index: ApiIndex;
  readonly byId: ReadonlyMap<string, ApiSource>;
  readonly byPath: ReadonlyMap<string, ApiSource>;
  readonly parse: ReadonlyMap<ApiSource, readonly SourceDiagnostic[]>;
  readonly libraries: readonly ApiLibrary[];
}

const PARAM = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/u;
const posix = (path: string): string => path.replace(/\\/gu, '/');

export class ApiProject {
  readonly #root: string;
  #state: State | undefined;

  constructor(root: string) {
    this.#root = posix(root);
  }

  /** Forget everything read: a `.fudapi` or the `package.json` changed. */
  invalidate(): void {
    this.#state = undefined;
  }

  get sources(): readonly ApiSource[] {
    return this.#read().sources;
  }

  /** The dependencies that publish `.fudapi`. */
  get libraries(): readonly ApiLibrary[] {
    return this.#read().libraries;
  }

  /** Every `<id>` of the project, the dependencies' included. */
  ids(): readonly string[] {
    return this.sources.map((s) => s.id);
  }

  /** The source of `<id>`, or `undefined` when the project has none. */
  source(id: string): ApiSource | undefined {
    return this.#read().byId.get(id);
  }

  /** The module `fudic:<id>`, or `undefined` when there is no such file. */
  module(id: string, side: Side): string | undefined {
    const state = this.#read();
    const source = state.byId.get(id);
    return source === undefined ? undefined : emitModule(source, state.index, this.context(source), side);
  }

  /** What the parser and the validator say about every file of the app, by file. */
  diagnostics(): readonly { readonly file: string; readonly diagnostics: readonly SourceDiagnostic[] }[] {
    const state = this.#read();
    return state.sources
      .filter((s) => s.origin === 'app')
      .map((s) => ({ file: s.path, diagnostics: [...state.parse.get(s)!, ...validateApi(s, state.index, this.context(s))] }))
      .filter((f) => f.diagnostics.length > 0);
  }

  /** What the compiler is told about the `.fudapi` at `path` (SDD-60 §3.14). */
  linked(path: string): LinkedApi | undefined {
    const source = this.#read().byPath.get(posix(path));
    if (source === undefined) return undefined;
    const decls = source.file.declarations;
    const has = (kind: Decl['kind']): boolean => decls.some((d) => d.kind === kind);
    const fns = decls.flatMap((d) => (d.kind === 'fn' ? [d] : []));
    const forms = [
      ...decls.flatMap((d) => (d.kind === 'form' ? [d.name.text] : [])),
      ...fns.flatMap((f) => (f.form === undefined ? [] : [f.form.name.text])),
    ];
    const route = this.context(source).route === undefined ? undefined : `${path.slice(0, -API_EXTENSION.length)}.fud`;
    const data = dataShape(source, this.#read().index);
    return {
      id: source.id,
      load: has('load'),
      paths: has('paths'),
      layout: has('layout'),
      functions: fns.map((f) => f.name.text),
      forms: [...new Set(forms)],
      ...(route !== undefined ? { route } : {}),
      ...(data !== undefined ? { data } : {}),
    };
  }

  /**
   * Every function of the project by URL pattern and method, for an adapter to mount
   * (SDD-60 §3.11): `/_fudic/fn/routes/blog/:slug/save/:id`.
   */
  functionTable(): readonly { readonly url: string; readonly method: string }[] {
    return this.sources.flatMap((source) =>
      source.file.declarations.flatMap((d) => {
        if (d.kind !== 'fn') return [];
        const id = source.id.split('/').map((seg) => seg.replace(PARAM, ':$1'));
        const own = (d.route?.segments ?? []).map((seg) => (seg.kind === 'param' ? `:${seg.text}` : seg.text));
        return [{ url: [FN_PREFIX, ...id, d.name.text, ...own].join('/'), method: d.verb.toUpperCase() }];
      }),
    );
  }

  /** What the `.fudapi` at `path` declares about the page it serves (SDD-60 §3.4, §4.5). */
  page(path: string): PageApi | undefined {
    const source = this.#read().byPath.get(posix(path));
    if (source === undefined) return undefined;
    const decls = source.file.declarations;
    const load = decls.find((d): d is LoadDecl => d.kind === 'load');
    return {
      id: source.id,
      ...(load !== undefined ? { load } : {}),
      paths: decls.some((d) => d.kind === 'paths'),
      layout: decls.some((d) => d.kind === 'layout'),
    };
  }

  /** Whether the file is the sibling of a route, its parameters and its URL pattern. */
  context(source: ApiSource): ApiContext {
    const routes = `${this.#root}/${ROUTES_DIR}/`;
    const page = `${source.path.slice(0, -API_EXTENSION.length)}.fud`;
    if (source.origin !== 'app' || !source.path.startsWith(routes) || !existsSync(page)) return {};
    const segments = page.slice(routes.length, -'.fud'.length).split('/');
    const params = segments.map((s) => PARAM.exec(s)?.[1]).filter((p): p is string => p !== undefined);
    const error = `${segments[segments.length - 1]}.fud` === ERROR_FILE;
    const pattern = `/${segments.filter((s, i) => !(s === 'index' && i === segments.length - 1)).map((s) => s.replace(PARAM, ':$1')).join('/')}`;
    const layoutProps = layoutPropsType(page, readFileSync(page, 'utf8'), `${this.#root}/${API_TYPES_DIR}/${source.id}.d.ts`);
    return { route: { params, pattern, ...(error ? { error: true } : {}), ...(layoutProps !== undefined ? { layoutProps } : {}) } };
  }

  /**
   * Writes `.fudic/api/<id>.d.ts` for every `.fudapi` of the project, and only where the text
   * changed: an unchanged file keeps its date, so the TS server of the editor is not woken.
   * Answers the paths written.
   */
  writeDeclarations(): readonly string[] {
    const state = this.#read();
    const written: string[] = [];
    for (const source of state.sources) {
      const target = `${this.#root}/${API_TYPES_DIR}/${source.id}.d.ts`;
      const text = emitDeclarations(source, state.index, this.context(source));
      if (existsSync(target) && readFileSync(target, 'utf8') === text) continue;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
      written.push(target);
    }
    return written;
  }

  #read(): State {
    if (this.#state !== undefined) return this.#state;
    const found: { id: string; path: string; origin: ApiSource['origin'] }[] = walk(`${this.#root}/${SRC_DIR}`).map((path) => ({
      id: path.slice(this.#root.length + SRC_DIR.length + 2, -API_EXTENSION.length),
      path,
      origin: 'app',
    }));
    const libraries: ApiLibrary[] = [];
    for (const name of dependencies(this.#root)) {
      const dir = `${this.#root}/node_modules/${name}`;
      const folders = libraryFolders(dir);
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
    this.#state = {
      sources,
      index: createApiIndex(sources),
      byId: new Map(sources.map((s) => [s.id, s])),
      byPath: new Map(sources.map((s) => [s.path, s])),
      parse,
      libraries,
    };
    return this.#state;
  }
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

/**
 * Where a library keeps its `.fudapi` and its compiled implementations (SDD-60 §3.10):
 * `fudapi/`, `server/` and `browser/` at its root unless its `fudic.json` says otherwise.
 * *Decided while implementing:* the defaults of a library are its root folders, not the
 * `src/server` of an app, because what it publishes is compiled.
 */
function libraryFolders(dir: string): { readonly api: string; readonly server: string; readonly browser: string } {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(readFileSync(`${dir}/fudic.json`, 'utf8')) as Record<string, unknown>;
  } catch {
    // without a readable `fudic.json`, the defaults
  }
  const text = (key: string, fallback: string): string => (typeof config[key] === 'string' ? (config[key] as string) : fallback);
  return { api: text('api', API_DIR), server: text('server', 'server'), browser: text('browser', 'browser') };
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

/** The compiled files of a library folder, `.js` only, for the root to load one by one. */
export function libraryFiles(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .map(posix)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => join(dir, f).replace(/\\/gu, '/'));
}
