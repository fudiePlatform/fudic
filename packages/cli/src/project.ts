/**
 * Facts about the project on disk that a plan needs: which tags are taken, and how a
 * target file turns into a `FileChange`. Both go through the compiler or the injected
 * `ReadIo`; nothing here guesses from a filename.
 */

import { FUD_CONFIG_DUPLICATE_ID, readProjectConfig, type ProjectConfig } from '@fudic/config';
import { findLibraries, type LibraryFs } from '@fudic/resolve';
import { cliError, FUD_TARGET_EXISTS } from './diagnostics.js';
import { absolute, joinPosix, toPosix } from './paths.js';
import { parseFud } from './parse.js';
import { SKIPPED, walkFud, type ReadIo } from './io.js';
import type { ForeignTag } from './tag.js';
import type { CliError, FileChange } from './types.js';

/** Exact dependency versions the generated project pins (repo rule: no `^`, no `~`). */
export const FUDIC_VERSION = '0.0.1';
export const VITE_VERSION = '8.0.16';
/**
 * The TypeScript the generated project pins. It matters beyond the build: the language
 * server typechecks with the project's own version (SDD-24 §2), so a project that pins none
 * would get diagnostics in the editor that its CI cannot reproduce.
 */
export const TYPESCRIPT_VERSION = '5.9.3';

/*
 * `projectConfig(cwd, io)` used to live here: the `fudic.json` of the project AT `cwd`. It
 * is gone because since SDD-44 §4.3 a command does not operate on `cwd` — it resolves a
 * target project first, and reads the config of THAT one. `workspace/target.ts` owns it now,
 * and keeping a second reader keyed on `cwd` would be a way to get the wrong prefix back.
 */

/** A fudic project found on disk: a directory that has a `fudic.json` that reads. */
export interface WorkspaceProject {
  /** Where it is, relative to the swept root, POSIX. `'.'` when the root is itself one. */
  readonly dir: string;
  readonly config: ProjectConfig;
}

/**
 * Every fudic project under `root`. A directory is one if it has a `fudic.json` — that is
 * the whole discovery rule, and it is why there is no workspace registry: a file listing
 * the projects would be a second place the same fact lives.
 *
 * A configuration that does not read excludes that directory and does not stop the sweep.
 */
export function findProjectConfigs(root: string, io: ReadIo): readonly WorkspaceProject[] {
  const found: WorkspaceProject[] = [];
  const visit = (dir: string, rel: string): void => {
    const { config } = readProjectConfig(dir, io);
    if (config !== null) found.push({ dir: rel, config });
    for (const entry of io.list(dir)) {
      if (SKIPPED.has(entry)) continue;
      const full = joinPosix(dir, entry);
      if (io.isDirectory(full)) visit(full, rel === '.' ? entry : `${rel}/${entry}`);
    }
  };
  visit(toPosix(absolute(root, '.')), '.');
  return found;
}

/**
 * `FUD0724` for every `id` more than one project declares (§4.7).
 *
 * It lives in the CLI and never in the plugin, and that is not an oversight: a Vite build
 * sees one `root` and cannot know whether another project in the repo claims the same
 * name, so a check of its would be a permanent false negative dressed up as one.
 *
 * A project with no `id` declares no identity and collides with nobody.
 */
export function duplicateIds(projects: readonly WorkspaceProject[]): readonly CliError[] {
  const byId = new Map<string, string[]>();
  for (const project of projects) {
    if (project.config.id === '') continue;
    byId.set(project.config.id, [...(byId.get(project.config.id) ?? []), project.dir]);
  }

  const errors: CliError[] = [];
  for (const [id, dirs] of byId) {
    if (dirs.length > 1) {
      errors.push(
        cliError(FUD_CONFIG_DUPLICATE_ID, `the id "${id}" is declared by more than one project: ${dirs.join(', ')}`),
      );
    }
  }
  return errors;
}

/**
 * Every custom element already defined in the project. Read from the AST — a component's
 * identity is its host wrapper (decision 75), not its filename, and the two can differ.
 */
export function existingTags(cwd: string, io: ReadIo): ReadonlySet<string> {
  const tags = new Set<string>();
  for (const file of walkFud(cwd, io)) {
    const doc = parseFud(io.read(absolute(cwd, file))).doc;
    if (doc.type === 'component-document' && doc.name !== '') tags.add(doc.name);
  }
  return tags;
}

/**
 * The tags the libraries this project depends on already define (SDD-43 §4.5).
 *
 * `customElements` is one registry per document, so a tag a library defines is taken for
 * every app that consumes it — and the collision shows up at the second `define()`, in a
 * browser, on a page that generated and built cleanly. Answering it here makes it a failure
 * of `fudic g component`, which is days earlier and one command away from being fixed.
 *
 * The walk is `@fudic/resolve`'s, the same one the editor's index uses: it follows DECLARED
 * dependencies rather than sweeping `node_modules`, so the cost is the number of dependencies
 * and a project with a thousand packages and one fudic library reads one library.
 */
export function libraryTags(cwd: string, io: ReadIo): ReadonlyMap<string, ForeignTag> {
  const root = toPosix(absolute(cwd, '.'));
  const tags = new Map<string, ForeignTag>();
  for (const library of findLibraries(root, libraryFs(io))) {
    for (const file of library.files) {
      const doc = parseFud(io.read(file)).doc;
      // First definition wins, as it does in the graph: what matters is that the name is
      // taken, and the file named is the one a reader will open.
      if (doc.type === 'component-document' && doc.name !== '' && !tags.has(doc.name)) {
        tags.set(doc.name, { library: library.name, file });
      }
    }
  }
  return tags;
}

/** `@fudic/resolve`'s dependency-walk port, over the read seam the CLI already has. */
function libraryFs(io: ReadIo): LibraryFs {
  return {
    readFile: (path) => (io.exists(path) ? io.read(path) : undefined),
    realPath: (path) => io.realPath(path),
    // A library's own `node_modules` is not its source, which is exactly what `walkFud`
    // already skips — so this is its paths made absolute and nothing else.
    fudFiles: (root) => walkFud(root, io).map((file) => joinPosix(root, file)),
  };
}

export interface TargetResult {
  readonly change?: FileChange;
  readonly error?: CliError;
}

/**
 * The change that puts `contents` at `file`. An existing target is a collision (FUD0443)
 * unless `--force`, in which case it is reported as a modification — overwriting someone's
 * file and calling it a creation would hide the only fact that matters.
 */
export function targetChange(
  cwd: string,
  file: string,
  contents: string,
  force: boolean,
  io: ReadIo,
): TargetResult {
  const path = absolute(cwd, file);
  if (!io.exists(path)) return { change: { kind: 'create', path: file, contents } };
  if (!force) {
    return { error: cliError(FUD_TARGET_EXISTS, `${file} already exists; pass --force to overwrite`, file) };
  }
  return { change: { kind: 'modify', path: file, contents, before: io.read(path) } };
}
