/**
 * `fudic add <module>` (BUG-50 §4.6): something a project did not have when it was created.
 *
 * An optional module of fudic — `di`, `forms`, `http`, `i18n` — at the version this CLI pins,
 * or a library of the workspace as `workspace:*`; then the install. `add http` also writes the
 * chain every server function goes through, and `add i18n --locales` the app's languages.
 * Adding what is already there changes nothing, and says so.
 */

import { FUD0455 } from '@fudic/diagnostics';
import { joinPosix } from '../paths.js';
import { parseFud } from '../parse.js';
import { targetChange } from '../project.js';
import { renderTemplate } from '../templates.js';
import { FUDIC_VERSION } from '../project.js';
import { configChange, readConfigObject } from '../workspace/config-edit.js';
import { findProjects, workspaceRoot, type Project } from '../workspace/discover.js';
import { librarySpecifier } from '../workspace/link.js';
import { MODULES, dependOn, dependOnModule, installFor, projectName } from '../workspace/modules.js';
import { resolveTarget, type Target } from '../workspace/target.js';
import { nodeReadIo, walkFud, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type AddOptions, type FileChange, type Plan } from '../types.js';

export function planAdd(module: string, opts: AddOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  const target = resolved.target;
  const pkg = MODULES[module];
  return Promise.resolve(pkg === undefined ? addLibrary(module, target, opts, io) : addModule(module, pkg, target, opts, io));
}

function addModule(module: string, pkg: string, target: Target, opts: AddOptions, io: ReadIo): Plan {
  const name = projectName(target);
  const changes: FileChange[] = [];
  const lines: string[] = [];

  const dependency = dependOnModule(target, pkg, io);
  if (dependency !== undefined) changes.push(dependency);

  // A `src/http.ts` that is already there — written by an earlier `add http`, or by hand — is the
  // user's chain: kept, not a collision. `--force` writes it again.
  if (module === 'http' && (opts.force || !io.exists(joinPosix(target.path, 'src/http.ts')))) {
    // Absent, or `--force`: `targetChange` has a change for either.
    changes.push(targetChange(opts.cwd, joinPosix(target.dir, 'src/http.ts'), renderTemplate('http.ts.tmpl', {}), true, io).change as FileChange);
    lines.push('  src/http.ts: the chain every server function goes through');
  }
  if (module === 'i18n' && opts.locales.length > 0) {
    changes.push(configChange(target, { ...readConfigObject(target, io), locales: opts.locales }, io));
    lines.push(`  locales ${opts.locales.join(', ')} in fudic.json: fudic translate writes their catalogs`);
  }

  if (changes.length === 0) return { ...EMPTY_PLAN, report: ['', `${name} already has ${pkg}`] };
  return {
    ...EMPTY_PLAN,
    changes,
    commands: dependency === undefined ? [] : [installFor(target, opts.cwd, io)],
    report: [
      '',
      dependency === undefined ? `Updated ${name}` : `Added ${pkg} ${FUDIC_VERSION} to ${name}`,
      ...(dependency === undefined ? [] : ['  Installed dependencies (pnpm)']),
      ...lines,
    ],
  };
}

function addLibrary(module: string, target: Target, opts: AddOptions, io: ReadIo): Plan {
  const root = workspaceRoot(target.path, io);
  const projects = root === null ? [] : findProjects(root, io);
  const libraries = projects.filter((project) => project.config.kind === 'lib' && project.path !== target.path);
  const library = libraries.find((project) => project.name === module);
  if (library === undefined) {
    return { ...EMPTY_PLAN, errors: [FUD0455({ module, libraries: libraries.map((project) => project.name) })] };
  }

  const name = projectName(target);
  const dependency = dependOn(target, packageNameOf(library, io), 'workspace:*', io);
  if (dependency === undefined) return { ...EMPTY_PLAN, report: ['', `${name} already uses ${module}`] };

  const example = firstComponent(library, opts.cwd, io);
  return {
    ...EMPTY_PLAN,
    changes: [dependency],
    commands: [installFor(target, opts.cwd, io)],
    report: [
      '',
      `${name} now uses ${module}`,
      '  Installed dependencies (pnpm)',
      ...(example === undefined ? [] : [`  <link rel="component" href="${example}">`]),
    ],
  };
}

/** The `name` of a library's `package.json`; its folder name when it has none. */
function packageNameOf(library: Project, io: ReadIo): string {
  const file = joinPosix(library.path, 'package.json');
  const declared = io.exists(file) ? (JSON.parse(io.read(file)) as { name?: unknown }).name : undefined;
  return typeof declared === 'string' && declared !== '' ? declared : library.name;
}

/** How an app links the first component of `library`, to show it: none when it has none. */
function firstComponent(library: Project, cwd: string, io: ReadIo): string | undefined {
  const file = walkFud(library.path, io).find((path) => parseFud(io.read(joinPosix(library.path, path))).doc.type === 'component-document');
  return file === undefined ? undefined : librarySpecifier(joinPosix(library.path, file), cwd, io);
}
