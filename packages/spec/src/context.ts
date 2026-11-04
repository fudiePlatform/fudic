/**
 * What a `.fudspec` is validated against, built once for everyone who validates one: the editor,
 * the workbench and the project check. Three answers that used to be built three times, and
 * that must not differ — a criterion red in the editor and green in the build is the defect.
 *
 * The terms are the project's `fudic/terms/` first, then the framework's; a component is what
 * the caller's index says it is; its fixtures are the `<tag>.fixture.ts` next to its `.fud`.
 */

import { createTermCatalog, type SpecFs, type TermRoot } from './catalog.js';
import { readFixtures } from './fixtures.js';
import { FIXTURE_EXTENSION, TERMS_DIR } from './names.js';
import type { ComponentInfo, SpecContext } from './validate.js';

/** The package whose `terms/` is the framework layer. */
export const TERMS_PACKAGE = '@fudic/terms';

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
 * catalog is a snapshot, read once: a term that changes asks for a new context.
 */
export function specContextOf(root: string, io: SpecIo): SpecContext {
  const terms = createTermCatalog(termRootsOf(root, io), io.fs);
  return {
    terms,
    component: (tag) => io.component(tag),
    fixtures: (tag) => {
      const component = io.component(tag);
      if (component === undefined) return undefined;
      const path = fixturePathOf(component);
      const source = io.fs.readFile(path);
      return source === undefined ? undefined : readFixtures(source, path);
    },
  };
}
