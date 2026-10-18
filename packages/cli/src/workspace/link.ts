/**
 * How `--in` names a component that lives in ANOTHER package (SDD-35, SDD-44 §4.7).
 *
 * Inside one package an `href` is a path. Across packages it is the library's name — what the
 * consumer declares and installs — and never a path that climbs out of the consumer: the editor
 * and the build index a project and the libraries it depends on, and a file reached only by
 * `../../../../libs/…` is in neither, so the link the command wrote was red the moment it was
 * written (`FUD0460`), and since SDD-35 a red link fails the build.
 *
 * So a cross-package `--in` writes what the editor's own completion offers — the specifier
 * the library's `exports` give the file — and makes sure the consumer declares the library,
 * because a specifier of a package nobody depends on resolves to nothing either.
 */

import { owningPackage, packageNameOf, specifierOf, subpathOf, type PackageFs } from '@fudic/resolve';
import { findProjects, workspaceRoot } from './discover.js';
import { FUD0787 } from '@fudic/diagnostics';
import type { ReadIo } from '../io.js';
import { absolute, hrefBetween, joinPosix, relativeTo, toPosix } from '../paths.js';
import type { CliError, FileChange } from '../types.js';

/** What linking a component from a file takes: the `href`, and maybe a `package.json` edit. */
export type ComponentLink =
  | { readonly href: string; readonly dependency?: FileChange }
  | { readonly error: CliError };

/** The `ReadIo` of the CLI as the port `@fudic/resolve` walks packages through. */
function packageFs(io: ReadIo): PackageFs {
  return {
    readFile: (path) => (io.exists(path) ? io.read(path) : undefined),
    realPath: (path) => io.realPath(path),
  };
}

/**
 * The link from `into` to `component`, both relative to `cwd` as the user named them.
 */
export function componentLink(into: string, component: string, cwd: string, io: ReadIo): ComponentLink {
  const fs = packageFs(io);
  const intoPath = absolute(cwd, into);
  const componentPath = absolute(cwd, component);
  const consumer = owningPackage(toPosix(intoPath), fs);
  const library = owningPackage(toPosix(componentPath), fs);
  if (consumer === undefined || library === undefined || consumer === library) {
    return { href: hrefBetween(into, component) };
  }

  const name = packageName(library, io);
  const href = specifierOf({ name, root: library }, toPosix(componentPath), fs);
  if (href === undefined) return { error: FUD0787({ file: into, library: name }) };

  const dependency = declareDependency(joinPosix(consumer, 'package.json'), relativeTo(cwd, joinPosix(consumer, 'package.json')), name, 'workspace:*', io);
  return dependency === undefined ? { href } : { href, dependency };
}

/**
 * How an app links `component` (relative to `cwd`) of a library: the package specifier its
 * `exports` gives it, `@shop/ui/ui-button.fud`. Undefined when the file is in no package, or
 * the package does not export it.
 */
export function librarySpecifier(component: string, cwd: string, io: ReadIo): string | undefined {
  const fs = packageFs(io);
  const componentPath = toPosix(absolute(cwd, component));
  const library = owningPackage(componentPath, fs);
  if (library === undefined) return undefined;
  return specifierOf({ name: packageName(library, io), root: library }, componentPath, fs);
}

/** The `exports` rule that gives a library's layouts their public name: `@shop/ui/layouts/main.fud`. */
const LAYOUTS_KEY = './layouts/*.fud';
const LAYOUTS_TARGET = './src/layouts/*.fud';

/** How an app links a layout of a library, and the `package.json` edit that makes it linkable. */
export interface LayoutExport {
  readonly specifier?: string;
  readonly change?: FileChange;
}

/**
 * How an app links `layout` (relative to `cwd`), a file of `src/layouts/` of the library at
 * `library` (absolute POSIX). A library generated before its `exports` had the layouts rule
 * gets it here, which is what makes the layout reachable at all: the components rule maps
 * `@shop/ui/layouts/main.fud` to a component folder that does not exist.
 */
export function layoutExport(library: string, layout: string, cwd: string, io: ReadIo, inLayouts: boolean): LayoutExport {
  const name = packageName(library, io);
  const specifier = specifierOf({ name, root: library }, toPosix(absolute(cwd, layout)), packageFs(io));
  if (specifier !== undefined) return { specifier };
  // The rule maps `src/layouts/` only: a layout anywhere else is the author's to export.
  if (!inLayouts) return {};
  const manifest = joinPosix(library, 'package.json');
  const change = exportRule(manifest, relativeTo(cwd, manifest), io);
  if (change === undefined) return {};
  return { specifier: `${name}/layouts/${layout.slice(layout.lastIndexOf('/') + 1)}`, change };
}

/**
 * The edit that adds the layouts rule to the `exports` object of the `package.json` at `path`,
 * written into the text like `declareDependency`. Nothing when `exports` is not an object.
 */
function exportRule(path: string, shown: string, io: ReadIo): FileChange | undefined {
  const before = io.read(path);
  const exports = (parse(before) as { exports?: unknown }).exports;
  if (exports === null || typeof exports !== 'object' || Array.isArray(exports)) return undefined;
  // A valid manifest whose `exports` is an object writes it as `"exports": {`.
  const open = /"exports"\s*:\s*\{/u.exec(before)!;
  const start = open.index + open[0].length;
  let close = start;
  for (let depth = 1; depth > 0; close++) {
    if (before[close] === '{') depth++;
    if (before[close] === '}') depth--;
  }
  close--;
  const inside = before.slice(start, close).trimEnd();
  const entry = `${JSON.stringify(LAYOUTS_KEY)}: ${JSON.stringify(LAYOUTS_TARGET)}`;
  const contents = `${before.slice(0, start)}${inside}${inside.trim() === '' ? '' : ','}\n    ${entry}\n  ${before.slice(close)}`;
  return { kind: 'modify', path: shown, contents, before };
}

/** The file a package specifier names inside the workspace, and the project it is in. */
export interface WorkspaceFile {
  /** Relative to `cwd`. */
  readonly file: string;
  /** The project's directory name, as `--uses` and `--project` name it. */
  readonly project: string;
}

/**
 * The file of the workspace a package specifier names — `@shop/ui/layouts/main.fud` is
 * `libs/ui/src/layouts/main.fud` —, read off that project's own `exports` as Node maps them,
 * so it answers before anything is installed. Undefined when no project of the workspace is
 * that package, or its `exports` do not map the subpath.
 */
export function workspaceFile(specifier: string, cwd: string, io: ReadIo): WorkspaceFile | undefined {
  const root = workspaceRoot(cwd, io);
  if (root === null) return undefined;
  const name = packageNameOf(specifier);
  const project = findProjects(root, io).find((candidate) => packageName(candidate.path, io) === name);
  if (project === undefined) return undefined;
  const inside = mapped(subpathOf(specifier), (parse(io.read(joinPosix(project.path, 'package.json'))) as { exports?: unknown }).exports);
  return inside === undefined ? undefined : { file: relativeTo(cwd, joinPosix(project.path, inside)), project: project.name };
}

/**
 * Where `exports` sends `subpath` (`./layouts/main.fud`): a path inside the package, or nothing.
 * An exact key wins; among patterns, the one with the longest part before its `*`, as Node
 * picks it — `./layouts/*.fud` over `./*.fud`, whatever order they are written in.
 */
function mapped(subpath: string, exports: unknown): string | undefined {
  if (exports === undefined) return subpath;
  if (exports === null || typeof exports !== 'object') return undefined;
  let best: { readonly head: string; readonly path: string } | undefined;
  for (const [key, target] of Object.entries(exports)) {
    if (typeof target !== 'string') continue;
    const [head = '', tail] = key.split('*');
    if (tail === undefined) {
      if (key === subpath) return target;
      continue;
    }
    const fits = subpath.length > head.length + tail.length && subpath.startsWith(head) && subpath.endsWith(tail);
    if (fits && (best === undefined || head.length > best.head.length)) {
      best = { head, path: target.replaceAll('*', subpath.slice(head.length, subpath.length - tail.length)) };
    }
  }
  return best?.path;
}

/** The `name` of the `package.json` at `root`, or its folder name when it declares none. */
function packageName(root: string, io: ReadIo): string {
  const declared = (parse(io.read(joinPosix(root, 'package.json'))) as { name?: unknown }).name;
  return typeof declared === 'string' && declared !== '' ? declared : root.slice(root.lastIndexOf('/') + 1);
}

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

/**
 * The edit that makes the `package.json` at `path` depend on `name` at `version`, or nothing when it
 * already does.
 *
 * Written into the text rather than re-serialized, for the reason `wire.ts` gives for the
 * `.fud`: this is a file the user owns, and the command touches the one line it adds.
 */
export function declareDependency(path: string, shown: string, name: string, version: string, io: ReadIo): FileChange | undefined {
  const before = io.read(path);
  const manifest = parse(before) as Record<string, unknown>;
  const declared = DEPENDENCY_FIELDS.some((field) => {
    const block = manifest[field];
    return block !== null && typeof block === 'object' && name in block;
  });
  if (declared) return undefined;

  const entry = `${JSON.stringify(name)}: ${JSON.stringify(version)}`;
  const open = /"dependencies"\s*:\s*\{/u.exec(before);
  let contents: string;
  if (open !== null) {
    const at = open.index + open[0].length;
    const empty = Object.keys(manifest['dependencies'] as object).length === 0;
    contents = `${before.slice(0, at)}\n    ${entry}${empty ? '\n  ' : ','}${before.slice(at).replace(empty ? /^\s*/u : /^/u, '')}`;
  } else {
    const close = before.lastIndexOf('}');
    contents = `${before.slice(0, close).trimEnd()},\n  "dependencies": {\n    ${entry}\n  }\n${before.slice(close)}`;
  }
  return { kind: 'modify', path: shown, contents, before };
}

/** A `package.json`'s object; one that does not parse reads as empty. */
function parse(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
