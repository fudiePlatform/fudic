/**
 * `fudic g app <nombre>` (SDD-44 §3.1): another app in the workspace.
 *
 * The same tree `fudic new` writes, placed under `apps/` and pointed at the root's
 * `tsconfig.base.json` and `fudic-globals.d.ts` (§4.6). It registers the app nowhere, because
 * there is nowhere to register it: `pnpm-workspace.yaml` uses patterns, not a list, so a new
 * project under `apps/` is already inside.
 */

import { appFiles, scaffoldChanges, scaffoldRefusal } from './scaffold.js';
import { duplicateIds } from '../project.js';
import { placeProject } from '../workspace/place.js';
import { appUses, packageOf, usesErrors } from '../workspace/uses.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type AppOptions, type NewOptions, type Plan } from '../types.js';

/**
 * What the app tree needs beyond what `fudic g app` is given.
 *
 * A workspace is a pnpm workspace by definition — its root file says so — and the layout name
 * and the adapter are the defaults `fudic new` uses. `install` and `git` are false because
 * this command adds a package to a repository that already exists and is already installed:
 * SDD-22's generators add a piece and run nothing, and this is one of those.
 */
function asNewOptions(opts: AppOptions): NewOptions {
  return {
    cwd: opts.cwd,
    force: opts.force,
    id: opts.id,
    prefix: opts.prefix,
    pm: 'pnpm',
    install: false,
    git: false,
    sw: opts.sw,
    layout: '_layout',
    target: 'static',
  };
}

export function planApp(name: string, opts: AppOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const placed = placeProject(name, opts, io);
  if (placed.placement === undefined) {
    return Promise.resolve({ ...EMPTY_PLAN, errors: placed.errors });
  }
  const { dir, up, scope, projects } = placed.placement;

  const asNew = asNewOptions(opts);
  // The same field checks `fudic new` runs: this command refuses to write a `fudic.json` its
  // own reader would reject. The directory guard inside it never fires here — `placeProject`
  // already answered that question, and better.
  const refused = scaffoldRefusal(dir, asNew, io);
  if (refused !== null) return Promise.resolve({ ...EMPTY_PLAN, errors: [refused] });

  // The id is written because it was given, never derived from the directory or the npm name
  // (§4.4). Two projects claiming one id is FUD0724, and this is one of the two commands that
  // can see it coming: a build sees a single root and could never know.
  const clashing = duplicateIds([
    // The project being replaced does not collide with itself: under `--force` its id is the
    // one going away, and counting it would make overwriting an app impossible.
    ...projects
      .filter((project) => project.name !== name)
      .map((project) => ({ dir: project.name, config: project.config })),
    { dir: name, config: { id: opts.id, kind: 'app', prefix: opts.prefix, styles: [] } },
  ]);

  const errors = [...usesErrors(opts.uses, projects), ...clashing];
  if (errors.length > 0) return Promise.resolve({ ...EMPTY_PLAN, errors });

  const built = scaffoldChanges(
    opts,
    appFiles({ dir, pkgName: packageOf(scope, name), up, uses: appUses(scope, opts.uses) }, asNew),
    io,
  );

  return Promise.resolve({ ...EMPTY_PLAN, changes: built.changes, errors: built.errors });
}
