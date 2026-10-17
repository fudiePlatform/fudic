/**
 * `fudic g app <nombre>` (SDD-44 §3.1, BUG-50 §4.5): another app in the workspace.
 *
 * The same tree `fudic new` writes, placed under `apps/` and pointed at the root's
 * `tsconfig.base.json` and `fudic-globals.d.ts` (§4.6). It registers the app nowhere, because
 * there is nowhere to register it: `pnpm-workspace.yaml` uses patterns, not a list, so a new
 * project under `apps/` is already inside.
 *
 * It is served at a base URL of its own — `/<name>/` unless `--base`, `/` when it is the first
 * app — so that `fudic dev` can put every app on one port, and it installs when it is done:
 * an app nobody can run without a second command is the bug this replaces.
 */

import { FUD0452 } from '@fudic/diagnostics';
import { appFiles, scaffoldChanges, scaffoldRefusal } from './scaffold.js';
import { duplicateIds } from '../project.js';
import { relativeTo } from '../paths.js';
import { DEV_PORT, normalizeBase, servedApps, type ServedApp } from '../workspace/bases.js';
import { placeProject } from '../workspace/place.js';
import { appUses, packageOf, usesErrors } from '../workspace/uses.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type AppOptions, type NewOptions, type Plan } from '../types.js';

/**
 * What the app tree needs beyond what `fudic g app` is given.
 *
 * A workspace is a pnpm workspace by definition — its root file says so — and the layout name
 * and the adapter are the defaults `fudic new` uses. `install` and `git` are false here because
 * the install is the WORKSPACE's, run from its root by this plan, and the repository already
 * exists.
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
  const { root, dir, up, scope, projects } = placed.placement;

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
    { dir: name, config: { id: opts.id, kind: 'app', prefix: opts.prefix, globalStyles: [], styles: [] } },
  ]);

  // The other apps, and where they are: one base per app, and a dev port nobody else has.
  const others = servedApps(projects.filter((project) => project.name !== name), io);
  const base = normalizeBase(opts.base ?? (others.length === 0 ? '/' : name));
  const port = Math.max(DEV_PORT - 1, ...others.map((app) => app.port)) + 1;
  const taken = others.find((app) => app.base === base);

  const errors = [
    ...usesErrors(opts.uses, projects),
    ...clashing,
    ...(taken === undefined ? [] : [FUD0452({ base, app: taken.name })]),
  ];
  if (errors.length > 0) return Promise.resolve({ ...EMPTY_PLAN, errors });

  const built = scaffoldChanges(
    opts,
    appFiles({ dir, pkgName: packageOf(scope, name), up, uses: appUses(scope, opts.uses), serve: { base, port } }, asNew),
    io,
  );

  return Promise.resolve({
    ...EMPTY_PLAN,
    changes: built.changes,
    errors: built.errors,
    commands: [{ command: 'pnpm', args: ['install'], dir: relativeTo(opts.cwd, root) || '.', quiet: true }],
    report: appReport({ name, dir, base, port, uses: opts.uses, others }),
  });
}

interface AppReport {
  readonly name: string;
  readonly dir: string;
  readonly base: string;
  readonly port: number;
  readonly uses: readonly string[];
  readonly others: readonly ServedApp[];
}

/** What `g app` tells the user (BUG-50 §6.4). */
function appReport(r: AppReport): readonly string[] {
  const elsewhere = [...r.others]
    .sort((a, b) => a.base.length - b.base.length || a.name.localeCompare(b.name))
    .map((app) => `${app.name} is at ${app.base}`)
    .join(', ');
  const bases = [...r.others.map((app) => app.base), r.base].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const [first = '/', ...rest] = bases;
  const every = [`http://localhost:${DEV_PORT}${first}`, ...rest].join('  ·  ');
  const only = `pnpm --filter ${r.name} dev`;
  return [
    '',
    `Created app ${r.name} in ${r.dir}`,
    '',
    `  base URL   ${r.base.padEnd(12)}${elsewhere === '' ? '' : `${elsewhere}. `}Change it with --base`,
    ...(r.uses.length === 0 ? [] : [`  uses       ${r.uses.join(', ')}`]),
    '',
    '  Installed dependencies (pnpm)',
    '',
    'Next',
    `  ${'pnpm dev'.padEnd(Math.max(28, only.length + 2))}every app:  ${every}`,
    `  ${only.padEnd(Math.max(28, only.length + 2))}only ${r.name}: http://localhost:${r.port}${r.base}`,
  ];
}
