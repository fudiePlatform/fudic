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

import { owningPackage, specifierOf, type PackageFs } from '@fudic/resolve';
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

  const dependency = declare(joinPosix(consumer, 'package.json'), relativeTo(cwd, joinPosix(consumer, 'package.json')), name, io);
  return dependency === undefined ? { href } : { href, dependency };
}

/** The `name` of the `package.json` at `root`, or its folder name when it declares none. */
function packageName(root: string, io: ReadIo): string {
  const declared = (parse(io.read(joinPosix(root, 'package.json'))) as { name?: unknown }).name;
  return typeof declared === 'string' && declared !== '' ? declared : root.slice(root.lastIndexOf('/') + 1);
}

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

/**
 * The edit that makes the `package.json` at `path` depend on `name`, or nothing when it
 * already does.
 *
 * Written into the text rather than re-serialized, for the reason `wire.ts` gives for the
 * `.fud`: this is a file the user owns, and the command touches the one line it adds.
 */
function declare(path: string, shown: string, name: string, io: ReadIo): FileChange | undefined {
  const before = io.read(path);
  const manifest = parse(before) as Record<string, unknown>;
  const declared = DEPENDENCY_FIELDS.some((field) => {
    const block = manifest[field];
    return block !== null && typeof block === 'object' && name in block;
  });
  if (declared) return undefined;

  const entry = `${JSON.stringify(name)}: "workspace:*"`;
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
