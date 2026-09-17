/**
 * `--uses` (SDD-44 §4.7): it links PACKAGES, not components.
 *
 * `fudic g app tienda --uses ui` adds `"@mi-tienda/ui": "workspace:*"` to the app's
 * dependencies, and that is all it does. It writes **no** `<link rel="component">`: which
 * component a given file uses is decided by whoever writes the `.fud`, and there is already
 * a command for that — `fudic g component --in`.
 */

import { cliError, FUD_USES_NOT_A_LIB } from '../diagnostics.js';
import { joinPosix } from '../paths.js';
import type { ReadIo } from '../io.js';
import type { CliError } from '../types.js';
import type { Project } from './discover.js';

/**
 * The npm scope of a workspace: what its root `package.json` calls itself.
 *
 * Read rather than derived from the directory, because the directory is the one thing about a
 * checkout that changes for reasons that have nothing to do with the project — and a
 * dependency written under a scope the root does not answer to is one pnpm cannot resolve.
 * The directory name is the fallback for a root that declares no name.
 */
export function workspaceScope(root: string, io: ReadIo): string {
  const path = joinPosix(root, 'package.json');
  if (io.exists(path)) {
    try {
      const parsed: unknown = JSON.parse(io.read(path));
      if (parsed !== null && typeof parsed === 'object') {
        const name = (parsed as Record<string, unknown>)['name'];
        // A scoped root (`@acme/monorepo`) lends its scope; a plain one lends its name.
        if (typeof name === 'string' && name !== '') {
          if (!name.startsWith('@')) return `@${name}`;
          const slash = name.indexOf('/');
          return slash < 0 ? name : name.slice(0, slash);
        }
      }
    } catch {
      // A root `package.json` that does not parse is not this command's business to report:
      // pnpm will say so, in its own words, the moment anything is installed.
    }
  }
  return `@${root.slice(root.lastIndexOf('/') + 1)}`;
}

/** The package specifier a workspace library is depended on by. */
export function packageOf(scope: string, name: string): string {
  return `${scope}/${name}`;
}

/**
 * `FUD0785` for every `--uses` that does not name a library of the workspace.
 *
 * An app is rejected as loudly as something absent, and on purpose: an app exports nothing,
 * so depending on one is an error that would otherwise surface much later — as a resolution
 * failure in a build, about a specifier the author never typed.
 */
export function usesErrors(
  uses: readonly string[],
  projects: readonly Project[],
): readonly CliError[] {
  const errors: CliError[] = [];
  for (const name of uses) {
    const project = projects.find((candidate) => candidate.name === name);
    if (project?.config.kind === 'lib') continue;
    errors.push(
      cliError(
        FUD_USES_NOT_A_LIB,
        project === undefined
          ? `--uses ${name}: no such project in the workspace${listOf(projects)}`
          : `--uses ${name}: that is an app, and an app exports nothing${listOf(projects)}`,
      ),
    );
  }
  return errors;
}

/** The libraries there ARE, so the message is actionable and not just a refusal. */
function listOf(projects: readonly Project[]): string {
  const libs = projects.filter((project) => project.config.kind === 'lib').map((project) => project.name);
  return libs.length === 0 ? '; this workspace has no libraries' : `; libraries: ${libs.join(', ')}`;
}

/** One `"@scope/name": "workspace:*"` per dependency, already quoted for JSON. */
function entries(scope: string, uses: readonly string[]): readonly string[] {
  return uses.map((name) => `${JSON.stringify(packageOf(scope, name))}: "workspace:*"`);
}

/**
 * The extra dependencies, appended INSIDE the `dependencies` block a template already opens.
 *
 * A block builder rather than a conditional in the template, for the reason §4.2 gives:
 * templates substitute and nothing else. `''` leaves `fudic new`'s `package.json` byte for
 * byte what it was, which is what criterion 2 checks.
 */
export function appUses(scope: string, uses: readonly string[]): string {
  const lines = entries(scope, uses);
  return lines.length === 0 ? '' : `,\n    ${lines.join(',\n    ')}`;
}
