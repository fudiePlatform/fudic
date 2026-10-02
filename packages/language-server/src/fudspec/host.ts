/**
 * What the `.fudspec` validator is checked against, as this server knows it (SDD-52 §4.4).
 *
 * Three things, and the `.fud` side lends only one of them: the workspace index, for which
 * components exist and which props they require. The terms come from the disk — the
 * workspace's `fudic/terms/` first, then the framework's — and the fixtures from the
 * `<tag>.fixture.ts` next to the component.
 *
 * The required props are the index's, read from the component's contract: the same props its
 * `$Props` is written from. When they cannot be proven the index answers none, so a criterion
 * is never told it lacks `props` on a guess.
 */

import {
  createTermCatalog,
  readFixtures,
  type ComponentInfo,
  type Fixtures,
  type SpecContext,
  type SpecFs,
  type TermCatalog,
  type TermRoot,
} from '@fudic/spec';
import { CONFIG_FILE } from '@fudic/config';
import type { WorkspaceIndex } from '../workspace-index.js';

/** Where a project keeps its own terms, next to its `fudic.json`. */
export const WORKSPACE_TERMS = 'fudic/terms';

export interface SpecHostDeps {
  readonly index: WorkspaceIndex;
  readonly fs: SpecFs;
  /** The workspace folders, POSIX-shaped. */
  readonly roots: () => readonly string[];
  /** The framework's `terms/` folder; absent when the host has none to offer. */
  readonly frameworkTerms?: string;
}

/** The folder a path is in. */
function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

export class SpecHost {
  readonly #deps: SpecHostDeps;
  /** One catalog per project folder, until a term changes. */
  readonly #catalogs = new Map<string, TermCatalog>();

  constructor(deps: SpecHostDeps) {
    this.#deps = deps;
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

  /** The term catalog a `.fudspec` at `path` resolves against. */
  terms(path: string): TermCatalog {
    const folder = this.#folderOf(path);
    const known = this.#catalogs.get(folder);
    if (known !== undefined) return known;

    const roots: TermRoot[] = [];
    if (folder !== '') roots.push({ layer: 'workspace', path: `${folder}/${WORKSPACE_TERMS}` });
    const framework = this.#deps.frameworkTerms;
    if (framework !== undefined) roots.push({ layer: 'framework', path: framework });

    const catalog = createTermCatalog(roots, this.#deps.fs);
    this.#catalogs.set(folder, catalog);
    return catalog;
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
    return component === undefined ? undefined : `${dirname(component.path)}/${tag}.fixture.ts`;
  }

  fixtures(tag: string): Fixtures | undefined {
    const path = this.fixturePath(tag);
    if (path === undefined) return undefined;
    const source = this.#deps.fs.readFile(path);
    return source === undefined ? undefined : readFixtures(source, path);
  }

  /** The text of a file the diagnostics or a definition point into. */
  read(path: string): string | undefined {
    return this.#deps.fs.readFile(path);
  }

  /** Everything `validateSpec` needs for the `.fudspec` at `path`. */
  context(path: string): SpecContext {
    return {
      terms: this.terms(path),
      component: (tag) => this.component(tag),
      fixtures: (tag) => this.fixtures(tag),
    };
  }

  /**
   * Whether a changed file can change what a `.fudspec` says: a term module, a fixture or a
   * component. The component side is the index's, which the server keeps current already.
   */
  static affects(path: string): boolean {
    return (
      (path.includes(`/${WORKSPACE_TERMS}/`) && path.endsWith('.js')) ||
      path.endsWith('.fixture.ts') ||
      path.endsWith('.fud')
    );
  }

  /** Forget every catalog: a term was added, changed or removed. */
  invalidate(): void {
    this.#catalogs.clear();
  }
}
