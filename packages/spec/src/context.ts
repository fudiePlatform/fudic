/**
 * What a `.fudspec` is validated against, built once for everyone who validates one: the editor,
 * the workbench and the project check. Answers that used to be built three times, and that must
 * not differ — a criterion red in the editor and green in the build is the defect.
 *
 * The terms are the project's `fudic/terms/` first, then the framework's; a component is what
 * the caller's index says it is; a page is a `.fud` of the routes folder; a flow is a name. The
 * fixture of each is the `.fixture.ts` beside its `.fudspec`. What a page can call comes from the
 * host, which reads the `.fudapi`: without it, that much is unknown and goes unchecked.
 */

import { ROUTES_DIR } from '@fudic/conventions';
import { createTermCatalog, type SpecFs, type TermRoot } from './catalog.js';
import { readFixtures, type Fixtures } from './fixtures.js';
import { FIXTURE_EXTENSION, FLOWS_DIR, TERMS_DIR } from './names.js';
import { findRoute, routeFiles, type RouteFile } from './routes.js';
import type { ComponentInfo, FlowInfo, FunctionInfo, PageInfo, SpecContext } from './validate.js';

/** The package whose `terms/` is the framework layer. */
export const TERMS_PACKAGE = '@fudic/terms';

/** What a page reaches, as its host reads it off the `.fudapi`. */
export interface PageReach {
  /** Whether the route declares `paths`. */
  readonly paths: boolean;
  /** Its functions, those of the components it links, and the project's remote rules. */
  readonly functions: readonly FunctionInfo[];
}

/** What a spec context is read from. */
export interface SpecIo {
  readonly fs: SpecFs;
  /** A component a criterion can name, by its tag; undefined when there is none. */
  component(tag: string): ComponentInfo | undefined;
  /**
   * The framework's `terms/` folder; null for none. Absent, the `@fudic/terms` installed in the
   * `node_modules` of the project or of a folder above it.
   */
  readonly frameworkTerms?: string | null;
  /** What the page whose `.fud` is at that absolute path reaches. Absent: unknown. */
  reach?(page: string): PageReach;
  /** Every function and remote rule of the project, what a flow can call. Absent: unknown. */
  functions?(): readonly FunctionInfo[];
}

/** The folder a POSIX path is in. */
function dirname(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/**
 * The `terms/` of the `@fudic/terms` in the `node_modules` of a folder or of one above it: what
 * that project installed. In a workspace each app and each library has its own, or none.
 */
export function installedTerms(fs: SpecFs, folder: string): string | undefined {
  // Up to the root of the disk, included: `C:` on Windows, `` on POSIX.
  for (let dir = folder; ; dir = dirname(dir)) {
    const pkg = `${dir}/node_modules/${TERMS_PACKAGE}`;
    if (fs.readDirectory(pkg).includes('terms')) return `${pkg}/terms`;
    if (!dir.includes('/')) return undefined;
  }
}

/** The fixture file of a component: `<tag>.fixture.ts`, next to its `.fud`. */
export function fixturePathOf(component: ComponentInfo): string {
  return `${dirname(component.path)}/${component.tag}${FIXTURE_EXTENSION}`;
}

/** The fixture file of a page: `<route>.fixture.ts`, next to its `.fud` (`index.fixture.ts` for `/`). */
export function pageFixturePathOf(page: string): string {
  return `${page.slice(0, -'.fud'.length)}${FIXTURE_EXTENSION}`;
}

/** The fixture file of a flow: `src/flows/<name>.fixture.ts`. */
export function flowFixturePathOf(root: string, name: string): string {
  return `${root}/${FLOWS_DIR}/${name}${FIXTURE_EXTENSION}`;
}

/**
 * The term roots of a project, in the order they resolve: its own, then the framework's. An
 * empty root is a file of no project, and it has no terms at all.
 */
export function termRootsOf(root: string, io: SpecIo): readonly TermRoot[] {
  if (root === '') return [];
  const roots: TermRoot[] = [{ layer: 'workspace', path: `${root}/${TERMS_DIR}` }];
  const framework = io.frameworkTerms === undefined ? installedTerms(io.fs, root) : io.frameworkTerms;
  if (framework !== undefined && framework !== null) roots.push({ layer: 'framework', path: framework });
  return roots;
}

/**
 * Everything `validateSpec` needs for the `.fudspec` of the project at `root` (POSIX-shaped). The
 * catalog and the routes are a snapshot, read once: a term or a page that changes asks for a new
 * context.
 */
export function specContextOf(root: string, io: SpecIo): SpecContext {
  const terms = createTermCatalog(termRootsOf(root, io), io.fs);
  const fixturesAt = (path: string): Fixtures | undefined => {
    const source = io.fs.readFile(path);
    return source === undefined ? undefined : readFixtures(source, path);
  };
  let routes: readonly RouteFile[] | undefined;
  const allRoutes = (): readonly RouteFile[] => (routes ??= root === '' ? [] : routeFiles(io.fs, `${root}/${ROUTES_DIR}`));

  const page = (route: string): PageInfo | undefined => {
    const found = findRoute(allRoutes(), route);
    if (found === undefined) return undefined;
    const fixture = pageFixturePathOf(found.path);
    const reach = io.reach?.(found.path);
    const fixtures = fixturesAt(fixture);
    return {
      ...found,
      fixture,
      ...(fixtures !== undefined ? { fixtures } : {}),
      paths: reach?.paths ?? 'unknown',
      functions: reach?.functions ?? 'unknown',
    };
  };

  const flow = (name: string): FlowInfo => {
    const fixture = flowFixturePathOf(root, name);
    const fixtures = fixturesAt(fixture);
    return { name, fixture, dir: `${root}/${FLOWS_DIR}`, ...(fixtures !== undefined ? { fixtures } : {}) };
  };

  return {
    terms,
    component: (tag) => io.component(tag),
    fixtures: (tag) => {
      const component = io.component(tag);
      return component === undefined ? undefined : fixturesAt(fixturePathOf(component));
    },
    page,
    flow,
    routes: allRoutes,
    functions: () => io.functions?.() ?? 'unknown',
    exists: (path) => io.fs.readFile(path) !== undefined,
  };
}
