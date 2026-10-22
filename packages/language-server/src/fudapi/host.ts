/**
 * What a `.fudapi` is checked against, as this server knows it (SDD-60 §3.10, §4.9): the
 * project index — every `.fudapi` of its app under `src/`, and the `fudapi/` folder of each of
 * its direct dependencies — and where the file sits.
 *
 * The project of a file is the nearest folder above it with a `package.json`, without leaving
 * its workspace folder. The list of files is read once per project and kept until a `.fudapi`
 * or a `package.json` changes on disk; the text of each comes from the editor when it is open
 * and from the disk when not, and is parsed again only when it changed.
 */

import {
  API_EXTENSION,
  createApiIndex,
  emitDeclarations,
  layoutPropsType,
  parseApi,
  type ApiContext,
  type ApiFile,
  type ApiIndex,
  type ApiSource,
  type ParseResult,
} from '@fudic/api';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import { API_DIR, API_TYPES_DIR, ERROR_FILE, ROUTES_DIR, SRC_DIR } from '@fudic/conventions';
import type { ApiFs } from './fs.js';

export interface ApiHostDeps {
  readonly fs: ApiFs;
  /** The workspace folders, POSIX-shaped. */
  readonly roots: () => readonly string[];
  /** The text of a file open in the editor, or `undefined` when it is not open. */
  readonly open: (path: string) => string | undefined;
}

/** A file of a project and where it comes from, before it is read. */
interface Found {
  readonly id: string;
  readonly path: string;
  readonly origin: ApiSource['origin'];
}

/** Everything the service needs about one `.fudapi`. */
export interface ApiProject {
  readonly source: ApiSource;
  readonly index: ApiIndex;
  readonly context: ApiContext;
  /** What the parser said about the file. */
  readonly parseDiagnostics: readonly SourceDiagnostic[];
}

const dirname = (path: string): string => path.slice(0, path.lastIndexOf('/'));
const PARAM = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/u;

export class ApiHost {
  readonly #deps: ApiHostDeps;
  /** The files of each project, by its folder. */
  readonly #files = new Map<string, readonly Found[]>();
  /** The last parse of each file, while its text does not change. */
  readonly #parsed = new Map<string, { readonly text: string; readonly result: ParseResult<ApiFile> }>();
  /** The types this server wrote or removed while running, by path: `undefined` is removed. */
  readonly #types = new Map<string, string | undefined>();
  #revision = 0;

  constructor(deps: ApiHostDeps) {
    this.#deps = deps;
  }

  /** The text of a file: the editor's when it is open, the disk's when not. */
  read(path: string): string | undefined {
    return this.#deps.open(path) ?? this.#deps.fs.readFile(path);
  }

  /** The folder of the project a file belongs to. */
  projectOf(path: string): string {
    const owners = this.#deps.roots().filter((root) => path.startsWith(`${root}/`));
    const workspace = owners.reduce((best, root) => (root.length > best.length ? root : best), '');
    for (let dir = dirname(path); dir.length > workspace.length; dir = dirname(dir)) {
      if (this.#deps.fs.readFile(`${dir}/package.json`) !== undefined) return dir;
    }
    return workspace === '' ? dirname(path) : workspace;
  }

  /** Every `.fudapi` of the app a file belongs to, under its `src/`: what a `.fud` may link. */
  appFiles(fromFile: string): readonly string[] {
    return this.#filesOf(this.projectOf(fromFile))
      .filter((f) => f.origin === 'app')
      .map((f) => f.path);
  }

  /** The `.fudapi` at `path` with `text`, its project index and its context. */
  load(path: string, text: string): ApiProject {
    const project = this.projectOf(path);
    const found = this.#filesOf(project);
    const own = found.find((f) => f.path === path) ?? { id: idOf(project, path), path, origin: 'app' as const };
    const others = found.filter((f) => f !== own).map((f) => this.#source(f, this.read(f.path) ?? '').source);
    const { source, diagnostics } = this.#source(own, text);
    return {
      source,
      index: createApiIndex([...others, source]),
      context: this.#context(project, path),
      parseDiagnostics: diagnostics,
    };
  }

  #source(found: Found, text: string): { readonly source: ApiSource; readonly diagnostics: readonly SourceDiagnostic[] } {
    const known = this.#parsed.get(found.path);
    const result = known !== undefined && known.text === text ? known.result : parseApi(text);
    this.#parsed.set(found.path, { text, result });
    return {
      source: { id: found.id, path: found.path, file: result.value, origin: found.origin },
      diagnostics: result.diagnostics,
    };
  }

  /** Every `.fudapi` of a project: its app's under `src/` and its direct dependencies' `fudapi/`. */
  #filesOf(project: string): readonly Found[] {
    const known = this.#files.get(project);
    if (known !== undefined) return known;

    const found: Found[] = this.#walk(`${project}/${SRC_DIR}`).map((path) => ({
      id: idOf(project, path),
      path,
      origin: 'app',
    }));
    for (const dependency of this.#dependencies(project)) {
      const folder = `${project}/node_modules/${dependency}/${API_DIR}`;
      for (const path of this.#walk(folder)) {
        found.push({
          id: `${dependency}/${path.slice(folder.length + 1, -API_EXTENSION.length)}`,
          path,
          origin: { package: dependency },
        });
      }
    }
    this.#files.set(project, found);
    return found;
  }

  /** The direct dependencies of a project, by its `package.json`. */
  #dependencies(project: string): readonly string[] {
    const text = this.#deps.fs.readFile(`${project}/package.json`);
    if (text === undefined) return [];
    try {
      const pkg = JSON.parse(text) as { dependencies?: object; devDependencies?: object };
      return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    } catch {
      return []; // a package.json being written is no dependencies yet, not an error
    }
  }

  /** Every `.fudapi` under a folder, `node_modules` and dot folders left out. */
  #walk(folder: string): string[] {
    const out: string[] = [];
    for (const entry of this.#deps.fs.list(folder)) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const path = `${folder}/${entry.name}`;
      if (entry.directory) out.push(...this.#walk(path));
      else if (entry.name.endsWith(API_EXTENSION)) out.push(path);
    }
    return out;
  }

  /** Whether the file is the sibling of a route, and that route's parameters. */
  #context(project: string, path: string): ApiContext {
    const routes = `${project}/${ROUTES_DIR}/`;
    const page = `${path.slice(0, -API_EXTENSION.length)}.fud`;
    const text = path.startsWith(routes) ? this.#deps.fs.readFile(page) : undefined;
    if (text === undefined) return {};
    const segments = page.slice(routes.length, -'.fud'.length).split('/');
    const params = segments.map((s) => PARAM.exec(s)?.[1]).filter((p): p is string => p !== undefined);
    const error = `${segments[segments.length - 1]}.fud` === ERROR_FILE;
    const pattern = `/${segments.filter((s, i) => !(s === 'index' && i === segments.length - 1)).map((s) => s.replace(PARAM, ':$1')).join('/')}`;
    const layoutProps = layoutPropsType(page, text, `${project}/${API_TYPES_DIR}/${idOf(project, path)}.d.ts`);
    return { route: { params, pattern, ...(error ? { error: true } : {}), ...(layoutProps !== undefined ? { layoutProps } : {}) } };
  }

  /**
   * Writes `.fudic/api/<id>.d.ts` for every `.fudapi` of a project, its dependencies' included,
   * and only where the text changed (SDD-60 §3.11, §4.9). All of them and not the one saved: a
   * type or a middleware changes the files that use it, and the pass is one parse each, cached.
   * Answers the paths written.
   */
  generate(project: string): readonly string[] {
    const found = this.#filesOf(project);
    const sources = found.map((f) => this.#source(f, this.read(f.path) ?? '').source);
    const index = createApiIndex(sources);
    const written: string[] = [];
    for (const source of sources) {
      const target = typesPath(project, source.id);
      const text = emitDeclarations(source, index, this.#context(project, source.path));
      if (this.#deps.fs.readFile(target) === text) continue;
      this.#deps.fs.writeFile(target, text);
      this.#wrote(target, text);
      written.push(target);
    }
    return written;
  }

  /** Removes the types of a `.fudapi` that is gone. */
  forget(path: string): void {
    const project = this.projectOf(path);
    const target = typesPath(project, idOf(project, path));
    this.#deps.fs.removeFile(target);
    this.#wrote(target, undefined);
  }

  /**
   * What this server wrote at `path` while running — the text, or `undefined` when it removed
   * it — or `null` when it never touched it. What the TypeScript of the project reads in place of
   * a disk it cached before the write (`mountApiTypes`).
   */
  written(path: string): string | undefined | null {
    return this.#types.has(path) ? this.#types.get(path) : null;
  }

  /** Every path this server wrote or removed while running. */
  writtenPaths(): readonly string[] {
    return [...this.#types.keys()];
  }

  /** Goes up with every write or removal: the types the project reads changed. */
  get revision(): number {
    return this.#revision;
  }

  #wrote(path: string, text: string | undefined): void {
    this.#types.set(path, text);
    this.#revision++;
  }

  /**
   * The projects of the workspace that have a `.fudapi` of their own under `src/`: what the
   * server generates the types of when it starts.
   */
  projects(): readonly string[] {
    const out = new Set<string>();
    for (const root of this.#deps.roots()) {
      for (const path of this.#walk(root)) {
        if (path.includes(`/${SRC_DIR}/`)) out.add(this.projectOf(path));
      }
    }
    return [...out];
  }

  /** Whether a changed file can change what a `.fudapi` says: another one, or a `package.json`. */
  static affects(path: string): boolean {
    return path.endsWith(API_EXTENSION) || path.endsWith('/package.json');
  }

  /** Forget the files of every project: one was added, removed or changed on disk. */
  invalidate(): void {
    this.#files.clear();
  }
}

/** Where the types of `<id>` are written in a project. */
const typesPath = (project: string, id: string): string => `${project}/${API_TYPES_DIR}/${id}.d.ts`;

/** The `<id>` of an app file: its path inside `src/`, without extension. */
function idOf(project: string, path: string): string {
  const src = `${project}/${SRC_DIR}/`;
  const inside = path.startsWith(src) ? path.slice(src.length) : path.slice(path.lastIndexOf('/') + 1);
  return inside.slice(0, -API_EXTENSION.length);
}
