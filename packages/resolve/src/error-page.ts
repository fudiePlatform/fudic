/**
 * Which error page a project paints with (SDD-87 §3.2, §4.1).
 *
 * An app's own `<routesDir>/_error.fud` wins, and then its chain is not even looked at. Without
 * it, the `src/_error.fud` of the ONE library of its chain that has one. Two or more is
 * `ambiguous`: never an order, because then adding a dependency would change pages without a
 * word (decision 5).
 *
 * It lives here, next to `dependencyChain`, because three hosts ask it — the plugin, the CLI
 * and the MCP — and a second copy is a second answer the day one falls behind.
 */

import { dependencyChain, type PackageFs } from './libraries.js';

/** The error page a LIBRARY offers to the apps that depend on it. */
export const LIBRARY_ERROR_FILE = 'src/_error.fud';

/** The file an app paints its errors with, inside its `routesDir`. */
const APP_ERROR_FILE = '_error.fud';

/** A library of the chain that offers an error page. */
export interface ErrorPageLibrary {
  readonly file: string;
  readonly package: string;
}

/** Where the error page of a project comes from (SDD-87 §3.2). */
export type ErrorPageSource =
  | { readonly kind: 'own'; readonly file: string }
  | { readonly kind: 'library'; readonly file: string; readonly package: string }
  | { readonly kind: 'ambiguous'; readonly libraries: readonly ErrorPageLibrary[] }
  | { readonly kind: 'none' };

const exists = (path: string, io: PackageFs): boolean => io.readFile(path) !== undefined;

/**
 * The error page `projectRoot` paints with: its own `<routesDir>/_error.fud`, else the
 * `src/_error.fud` of the one library of its chain that has one. Files are absolute, POSIX.
 *
 * A library has no `routesDir`: its own page is `src/_error.fud`, and its chain is never looked
 * at — a library does not paint errors, it offers them.
 */
export function errorPageOf(projectRoot: string, routesDir: string, io: PackageFs): ErrorPageSource {
  const root = io.realPath(projectRoot.replace(/\\/gu, '/')).replace(/\\/gu, '/');
  const chain = dependencyChain(root, io);
  const self = chain.find((p) => p.root === root);
  const isLibrary = self?.config.kind === 'lib';
  const own = isLibrary ? `${root}/${LIBRARY_ERROR_FILE}` : `${root}/${routesDir.replace(/^\.\/|\/$/gu, '')}/${APP_ERROR_FILE}`;
  if (exists(own, io)) return { kind: 'own', file: own };
  if (isLibrary) return { kind: 'none' };

  const libraries = chain
    .filter((p) => p !== self && exists(`${p.root}/${LIBRARY_ERROR_FILE}`, io))
    .map((p) => ({ file: `${p.root}/${LIBRARY_ERROR_FILE}`, package: p.name }));
  const [only, ...rest] = libraries;
  if (only === undefined) return { kind: 'none' };
  return rest.length === 0 ? { kind: 'library', ...only } : { kind: 'ambiguous', libraries };
}
