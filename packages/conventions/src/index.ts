/**
 * Where a fudic project keeps its sources (BUG-20 §3.1).
 *
 * This is a leaf package on purpose. The CLI writes these directories and the Vite plugin
 * reads them, but `@fudic/vite` is a devDependency of `@fudic/cli` and the reverse edge
 * would invert the boundary — the generator does not get to rule the compiler — while the
 * `@fudic/compiler` both share is fs-free by design and knows nothing about directories.
 * With nowhere to put it, the convention was copied into four literals across two packages
 * that only agreed by habit. This is the place they were missing.
 *
 * What belongs here is narrow, and the rule is the whole point: *a name two packages must
 * agree on and neither one owns*. Versions, generated file names and build output names
 * all have an owner already, and adding them would turn this into a drawer of strings.
 */

/** Where a fudic project keeps its sources. Not an option: a convention (§4.2). */
export const SRC_DIR = 'src';
export const ROUTES_DIR = 'src/routes';
export const COMPONENTS_DIR = 'src/components';
export const LAYOUTS_DIR = 'src/layouts';
