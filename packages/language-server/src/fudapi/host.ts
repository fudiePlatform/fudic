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
import { CONFIG_FILE } from '@fudic/config';
import { API_DIR, API_TYPES_DIR, ERROR_FILE, PIPES_DIR, ROUTES_DIR, SRC_DIR } from '@fudic/conventions';
import type { PropField, SpecIo } from '@fudic/spec';
import { linkedComponentIds, loadFields, specReach } from '@fudic/typecheck/api';
import type { ApiFs } from './fs.js';

/** What a page's `.fudapi` says its fixture holds. */
export interface PageContract {
  /** Its `<id>`: `routes/usuarios`, what its `Fixtures` are imported from. */
  readonly id: string;
  /** The fields of its `load`; absent when it declares none. */
  readonly load?: readonly PropField[];
  readonly paths: boolean;
}

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
    const own = found.find((f) => f.path === path) ?? { id: this.#appId(project, path), path, origin: 'app' as const };
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
      id: this.#appId(project, path),
      path,
      origin: 'app',
    }));
    for (const dependency of this.#dependencies(project)) {
      // A library's pipes: what a view of the app imports by the package (SDD-71 §4.5).
      const dir = `${project}/node_modules/${dependency}`;
      const pipes = `${dir}/${this.#pipesOf(dir)}`;
      for (const path of this.#walk(pipes)) {
        found.push({ id: `${dependency}/${idOf(dir, path)}`, path, origin: { package: dependency } });
      }
      const folder = `${project}/node_modules/${dependency}/${API_DIR}`;
      for (const path of this.#walk(folder)) {
        found.push({
          id: `${dependency}/${path.slice(folder.length + 1, -API_EXTENSION.length)}`,
          path,
          origin: { package: dependency },
        });
      }
    }
    // A library's own contracts, by the name its apps and its own scripts import them with
    // (SDD-75): what its types, its modules and its implementations are found under.
    const name = this.#packageName(project);
    if (name !== undefined) {
      const published = `${project}/${API_DIR}`;
      for (const path of this.#walk(published)) {
        found.push({ id: `${name}/${path.slice(published.length + 1, -API_EXTENSION.length)}`, path, origin: { package: name } });
      }
    }
    this.#files.set(project, found);
    return found;
  }

  /** A project's `fudic.json` as written, `{}` when it has none or it does not parse. */
  #config(dir: string): Record<string, unknown> {
    try {
      return JSON.parse(this.#deps.fs.readFile(`${dir}/fudic.json`) ?? '{}') as Record<string, unknown>;
    } catch {
      return {}; // a fudic.json being written is the defaults, not an error
    }
  }

  /** A project's folder of pipes, relative to it: its `pipes`, or `PIPES_DIR`. */
  #pipesOf(dir: string): string {
    const pipes = this.#config(dir)['pipes'];
    return typeof pipes === 'string' ? pipes : PIPES_DIR;
  }

  /**
   * The `<id>` of a `.fudapi` of the project: its path inside `src/`, and in a library's folder of
   * pipes with its package name in front, as its apps see it (SDD-71 §4.5).
   */
  #appId(project: string, path: string): string {
    const own = this.#ownPipes(project);
    return own !== undefined && path.startsWith(own.folder) ? `${own.name}/${idOf(project, path)}` : idOf(project, path);
  }

  /** In a library, its folder of pipes and its package name; `undefined` in an app. */
  #ownPipes(project: string): { readonly folder: string; readonly name: string } | undefined {
    if (this.#config(project)['kind'] !== 'lib') return undefined;
    const name = this.#packageName(project);
    return name !== undefined ? { folder: `${project}/${this.#pipesOf(project)}/`, name } : undefined;
  }

  /** The name a project's `package.json` gives it; `undefined` without one. */
  #packageName(project: string): string | undefined {
    try {
      const name = (JSON.parse(this.#deps.fs.readFile(`${project}/package.json`) ?? '{}') as { name?: unknown }).name;
      return typeof name === 'string' ? name : undefined;
    } catch {
      return undefined; // a package.json being written names nothing yet
    }
  }

  /**
   * The project whose `.fudic/api` holds the types of a `.fudapi`: the app's, for a dependency's
   * file reached through the app's `node_modules` — the library's own folder is no place to write.
   */
  #typesProject(path: string): string {
    const at = path.indexOf('/node_modules/');
    return at === -1 ? this.projectOf(path) : path.slice(0, at);
  }

  /** The `<id>` of a `.fudapi` of a project: as the project lists it, or as an app file would be named. */
  #idIn(project: string, path: string): string {
    return this.#filesOf(project).find((f) => f.path === path)?.id ?? this.#appId(project, path);
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

  /**
   * Whether the file is the sibling of a route: its parameters, its pattern, its layout's props
   * and the components it links — whose functions its `Calls` lists, as the build's does.
   */
  #context(project: string, path: string): ApiContext {
    const routes = `${project}/${ROUTES_DIR}/`;
    const page = `${path.slice(0, -API_EXTENSION.length)}.fud`;
    const text = path.startsWith(routes) ? this.read(page) : undefined;
    if (text === undefined) return {};
    const segments = page.slice(routes.length, -'.fud'.length).split('/');
    const params = segments.map((s) => PARAM.exec(s)?.[1]).filter((p): p is string => p !== undefined);
    const error = `${segments[segments.length - 1]}.fud` === ERROR_FILE;
    const pattern = `/${segments.filter((s, i) => !(s === 'index' && i === segments.length - 1)).map((s) => s.replace(PARAM, ':$1')).join('/')}`;
    const layoutProps = layoutPropsType(page, text, `${project}/${API_TYPES_DIR}/${idOf(project, path)}.d.ts`);
    const components = linkedComponentIds(project, page, text, (api) => this.read(api) !== undefined);
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

  /** Every `.fudapi` of a project, each with the text the editor has, and their index. */
  #sources(project: string): { readonly sources: readonly ApiSource[]; readonly index: ApiIndex } {
    const sources = this.#filesOf(project).map((f) => this.#source(f, this.read(f.path) ?? '').source);
    return { sources, index: createApiIndex(sources) };
  }

  /**
   * What a `.fudspec` of the project at `folder` can call (SDD-82 §8.2.9): the `reach` and
   * `functions` of its `SpecIo`, read from the `.fudapi` as the editor has them at each question.
   */
  specReach(folder: string): Required<Pick<SpecIo, 'reach' | 'functions'>> {
    const now = (): ReturnType<typeof specReach> => {
      const project = this.projectOf(`${folder}/${CONFIG_FILE}`);
      const { sources, index } = this.#sources(project);
      return specReach({ root: project, index, source: (path) => sources.find((s) => s.path === path), read: (path) => this.read(path) });
    };
    return { reach: (page) => now().reach(page), functions: () => now().functions() };
  }

  /**
   * What the `.fudapi` beside the page at `page` (its `.fud`) says a new fixture holds: its
   * `<id>`, the fields of its `load` and whether it declares `paths`. Undefined when the page has
   * no `.fudapi`: nothing to fake, and no `Fixtures` to type a fixture by (SDD-82 §8.2.42).
   */
  pageContract(page: string): PageContract | undefined {
    const path = `${page.slice(0, -'.fud'.length)}${API_EXTENSION}`;
    const { sources, index } = this.#sources(this.projectOf(path));
    const source = sources.find((s) => s.path === path);
    if (source === undefined) return undefined;
    const load = loadFields(source, index);
    return { id: source.id, ...(load !== undefined ? { load } : {}), paths: source.file.declarations.some((d) => d.kind === 'paths') };
  }

  /**
   * Writes `.fudic/api/<id>.d.ts` for every `.fudapi` of a project, its dependencies' included,
   * and only where the text changed (SDD-60 §3.11, §4.9). All of them and not the one saved: a
   * type or a middleware changes the files that use it, and the pass is one parse each, cached.
   * Answers the paths written.
   */
  generate(project: string): readonly string[] {
    const { sources, index } = this.#sources(project);
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

  /**
   * Where the types of the `.fudapi` at `path` are, written first when they are not there
   * (SDD-75 §3.2, `Types`).
   */
  typesOf(path: string): string {
    const project = this.#typesProject(path);
    const target = typesPath(project, this.#idIn(project, path));
    if (this.#deps.fs.readFile(target) === undefined) this.generate(project);
    return target;
  }

  /** The types of the `.fudapi` at `path` and their text, as `typesOf` leaves them on disk: none on a disk that refuses them. */
  typesText(path: string): { readonly path: string; readonly text: string } {
    const target = this.typesOf(path);
    return { path: target, text: this.#deps.fs.readFile(target) ?? '' };
  }

  /**
   * Writes again the types of the `.fudapi` at `path` and of every one whose types import it,
   * whether they changed or not (SDD-75 §3.2, `Regenerate`): the way back after a branch switch
   * or a lost file event. Answers the paths written.
   */
  regenerate(path: string): readonly string[] {
    const project = this.#typesProject(path);
    const { sources, index } = this.#sources(project);
    const id = this.#idIn(project, path);
    const written: string[] = [];
    for (const source of sources) {
      const text = emitDeclarations(source, index, this.#context(project, source.path));
      if (source.id !== id && !text.includes(JSON.stringify(`fudic:${id}`))) continue;
      const target = typesPath(project, source.id);
      this.#deps.fs.writeFile(target, text);
      this.#wrote(target, text);
      written.push(target);
    }
    return written;
  }

  /**
   * Where the scripts that implement the `.fudapi` at `path` are (SDD-75 §4.2): the `server/` and
   * `browser/` of its app's `src/` — of the library itself, for a library's own contract — and the
   * project's folder of pipes.
   */
  implementationFolders(path: string): readonly string[] {
    const project = this.projectOf(path);
    const base = path.startsWith(`${project}/${API_DIR}/`) ? project : `${project}/${SRC_DIR}`;
    return [`${base}/server`, `${base}/browser`, `${project}/${this.#pipesOf(project)}`];
  }

  /** Removes the types of a `.fudapi` that is gone. */
  forget(path: string): void {
    const project = this.projectOf(path);
    const target = typesPath(project, this.#idIn(project, path));
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
