/**
 * What the `.fudspec` validator is checked against, as this server knows it (SDD-52 §4.4).
 *
 * Three things, and the `.fud` side lends only one of them: the workspace index, for which
 * components exist and which props they require. The terms come from the disk — the
 * project's `fudic/terms/` first, then the `@fudic/terms` that project installed — and the fixtures from the
 * `<tag>.fixture.ts` next to the component.
 *
 * The required props are the index's, read from the component's contract: the same props its
 * `$Props` is written from. When they cannot be proven the index answers none, so a criterion
 * is never told it lacks `props` on a guess.
 */

import {
  TERMS_DIR,
  TERMS_PACKAGE,
  fixturePathOf,
  installedTerms as installedTermsOf,
  specContextOf,
  type ComponentInfo,
  type Fixtures,
  type FlowInfo,
  type FunctionInfo,
  type Name,
  type PageInfo,
  type SpecContext,
  type SpecFile,
  type SpecFs,
  type SpecIo,
  type TermCatalog,
} from '@fudic/spec';
import { CONFIG_FILE } from '@fudic/config';
import type { PageContract } from '../fudapi/host.js';
import type { WorkspaceIndex } from '../workspace-index.js';

/** Where a project keeps its own terms, next to its `fudic.json`. */
export const WORKSPACE_TERMS = TERMS_DIR;

/** What the `.fudapi` side tells a `.fudspec` (SDD-82 §8.2.9): the server's `ApiHost` answers it. */
export interface SpecApi {
  /** What a page or a flow of the project at `folder` can call. */
  specReach(folder: string): Required<Pick<SpecIo, 'reach' | 'functions'>>;
  /** What the `.fudapi` beside a page says its fixture holds; undefined without one. */
  pageContract(page: string): PageContract | undefined;
}

/** What a `.fudspec` specifies, looked up: the header, and what it names when it is there. */
export type SpecSubject =
  | { readonly kind: 'component'; readonly name: Name; readonly component?: ComponentInfo }
  | { readonly kind: 'page'; readonly name: Name; readonly page?: PageInfo }
  | { readonly kind: 'flow'; readonly name: Name; readonly flow: FlowInfo }
  | { readonly kind: undefined };

export interface SpecHostDeps {
  readonly index: WorkspaceIndex;
  readonly fs: SpecFs;
  /** The workspace folders, POSIX-shaped. */
  readonly roots: () => readonly string[];
  /**
   * The framework's `terms/` folder of a project, by its folder; undefined when it has none.
   * By default, the `@fudic/terms` the project installed.
   */
  readonly frameworkTerms?: (folder: string) => string | undefined;
  /** The `.fudapi` side; without it, what a page reaches is unknown and goes unchecked. */
  readonly api?: SpecApi;
}

/** The folder a path is in. */
function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

export { TERMS_PACKAGE };

/** The `@fudic/terms` a folder's project installed, as a lookup by folder. */
export function installedTerms(fs: SpecFs): (folder: string) => string | undefined {
  return (folder) => installedTermsOf(fs, folder);
}

export class SpecHost {
  readonly #deps: SpecHostDeps;
  readonly #frameworkTerms: (folder: string) => string | undefined;
  /** One context per project folder, until a term changes: its catalog is a snapshot. */
  readonly #contexts = new Map<string, SpecContext>();

  constructor(deps: SpecHostDeps) {
    this.#deps = deps;
    this.#frameworkTerms = deps.frameworkTerms ?? installedTerms(deps.fs);
  }

  /**
   * The project a file belongs to: the nearest folder above it with a `fudic.json`, without
   * leaving its workspace folder (the longest one that contains it), and that workspace folder
   * when no project file is on the way. In a monorepo the editor opens the repository, and the
   * terms are the project's, next to its `fudic.json` — not the repository's.
   */
  #folderOf(path: string): string {
    const owners = this.#deps.roots().filter((root) => path.startsWith(`${root}/`));
    const workspace = owners.reduce((best, root) => (root.length > best.length ? root : best), '');
    for (let dir = dirname(path); dir.length > workspace.length; dir = dirname(dir)) {
      if (this.#deps.fs.readDirectory(dir).includes(CONFIG_FILE)) return dir;
    }
    return workspace;
  }

  /** The workspace-layer root of terms for a `.fudspec` at `path`, where a new term is created. */
  workspaceTerms(path: string): string | undefined {
    const folder = this.#folderOf(path);
    return folder === '' ? undefined : `${folder}/${WORKSPACE_TERMS}`;
  }

  /** The term catalog a `.fudspec` at `path` resolves against. */
  terms(path: string): TermCatalog {
    return this.context(path).terms;
  }

  /**
   * The components with a tag. A file being started structures as a component with no name
   * (`isUndecided`), and an empty tag is nothing a criterion can name.
   */
  #components() {
    return this.#deps.index.all().filter((e) => e.role === 'component' && e.tag !== '');
  }

  /** A component of the workspace, by its tag. */
  component(tag: string): ComponentInfo | undefined {
    const entry = this.#components().find((e) => e.tag === tag);
    return entry === undefined ? undefined : { tag, path: entry.path, requiredProps: entry.requiredProps };
  }

  /** Every component tag of the workspace, sorted: what an `element` argument can name. */
  componentTags(): readonly string[] {
    return [...new Set(this.#components().map((e) => e.tag))].sort();
  }

  /** The fixture file of a component: `<tag>.fixture.ts`, next to its `.fud`. */
  fixturePath(tag: string): string | undefined {
    const component = this.component(tag);
    return component === undefined ? undefined : fixturePathOf(component);
  }

  /** The fixtures of a component; the same for every project, since they sit next to it. */
  fixtures(tag: string): Fixtures | undefined {
    return this.context('').fixtures(tag);
  }

  /** The text of a file the diagnostics or a definition point into. */
  read(path: string): string | undefined {
    return this.#deps.fs.readFile(path);
  }

  /** Everything `validateSpec` needs for the `.fudspec` at `path`. */
  context(path: string): SpecContext {
    const folder = path === '' ? '' : this.#folderOf(path);
    const known = this.#contexts.get(folder);
    if (known !== undefined) return known;
    const api = this.#deps.api;
    const context = specContextOf(folder, {
      fs: this.#deps.fs,
      component: (tag) => this.component(tag),
      frameworkTerms: folder === '' ? null : (this.#frameworkTerms(folder) ?? null),
      ...(api !== undefined && folder !== '' ? api.specReach(folder) : {}),
    });
    this.#contexts.set(folder, context);
    return context;
  }

  /** What the header of `file`, the `.fudspec` at `path`, names. */
  subject(path: string, file: SpecFile): SpecSubject {
    const header = file.header;
    const name = header?.name;
    if (header === undefined || name === undefined) return { kind: undefined };
    const context = this.context(path);
    switch (header.header) {
      case 'component': {
        const component = this.component(name.text);
        return { kind: 'component', name, ...(component !== undefined ? { component } : {}) };
      }
      case 'page': {
        const page = context.page(name.text);
        return { kind: 'page', name, ...(page !== undefined ? { page } : {}) };
      }
      case 'flow':
        return { kind: 'flow', name, flow: context.flow(name.text) };
    }
  }

  /** The fixture of what `subject` names, read without running it. */
  fixturesOf(subject: SpecSubject): Fixtures | undefined {
    switch (subject.kind) {
      case 'component':
        return this.fixtures(subject.name.text);
      case 'page':
        return subject.page?.fixtures;
      case 'flow':
        return subject.flow.fixtures;
      case undefined:
        return undefined;
    }
  }

  /** What a criterion of `subject` can call; 'unknown' for a component, or when no `.fudapi` side can say. */
  functionsOf(path: string, subject: SpecSubject): readonly FunctionInfo[] | 'unknown' {
    if (subject.kind === 'flow') return this.context(path).functions();
    return subject.kind === 'page' ? (subject.page?.functions ?? 'unknown') : 'unknown';
  }

  /** What the `.fudapi` beside a page says its fixture holds; undefined without one, or without a `.fudapi` side. */
  pageContract(page: string): PageContract | undefined {
    return this.#deps.api?.pageContract(page);
  }

  /**
   * Whether a changed file can change what a `.fudspec` says: a term module, a fixture, a
   * component or a page, a `.fudapi` — what a page can call —, or a `package.json` — where a
   * project installs or drops `@fudic/terms`. The component side is the index's, which the
   * server keeps current already.
   */
  static affects(path: string): boolean {
    return (
      (path.includes(`/${WORKSPACE_TERMS}/`) && path.endsWith('.js')) ||
      path.endsWith('.fixture.ts') ||
      path.endsWith('.fud') ||
      path.endsWith('.fudapi') ||
      path.endsWith('/package.json')
    );
  }

  /** Forget every catalog: a term was added, changed or removed. */
  invalidate(): void {
    this.#contexts.clear();
  }
}
