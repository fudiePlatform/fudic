/**
 * `fudic g showcase [<library>]` (SDD-66 §3.2, §4.2): an app that shows every component with a
 * fixture, a page per component with a block per case. In a workspace it is an app that CONSUMES
 * the library, created or extended here; in an app on its own, a folder of its routes.
 *
 * The fixtures are executed — a fixture can hold signals, and its shape is only known by running
 * it — and the pages are planned by `@fudic/workbench`, which already does both. The CLI does not
 * depend on it: it resolves it from the project, as `fudic spec` does, so the workbench a project
 * installed is the one that writes its showcase.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COMPONENTS_DIR, LAYOUTS_DIR, ROUTES_DIR } from '@fudic/conventions';
import { nodeReadIo, type ReadIo } from '../io.js';
import { resolveLayout } from '../layout.js';
import { absolute, dirname, hrefBetween, joinPosix, relativeTo, toPosix } from '../paths.js';
import { servedApps } from '../workspace/bases.js';
import { findProjects, workspaceRoot, type Project } from '../workspace/discover.js';
import { resolveTarget, routeRefusal } from '../workspace/target.js';
import { FUD0455 } from '@fudic/diagnostics';
import { prefixOf } from '../tag.js';
import { EMPTY_PLAN, type CliError, type FileChange, type Plan, type ShowcaseOptions } from '../types.js';
import { packageNameOf, planAdd } from './add.js';
import { planApp } from './app.js';

/** What the CLI needs of `@fudic/workbench`: its two functions, by their shape. */
export interface ShowcaseKit {
  executeFixtures(root: string, files: readonly string[]): Promise<{ readonly fixtures: ReadonlyMap<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>; readonly diagnostics: readonly CliError[] }>;
  planShowcase(input: {
    readonly command: string;
    readonly components: readonly {
      readonly tag: string;
      readonly href: string;
      readonly fixture: string;
      readonly fromHosts: { readonly href: string; readonly fixture: string };
      readonly cases: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      readonly file: string;
    }[];
    readonly routesDir: string;
    readonly hostsDir: string;
    readonly hostsHref: string;
    readonly layout: string | null;
    readonly lang: string;
    readonly url: string;
    readonly source: string;
    readonly existing: ReadonlyMap<string, string>;
  }): { readonly changes: readonly FileChange[]; readonly deletions: readonly string[]; readonly errors: readonly CliError[]; readonly diagnostics: readonly CliError[] };
}

/** The workbench the project at `dir` installed: the nearest `node_modules/@fudic/workbench` above it. */
export async function workbenchOf(dir: string): Promise<ShowcaseKit> {
  for (let at = dir; ; at = join(at, '..')) {
    const pkg = join(at, 'node_modules', '@fudic', 'workbench', 'package.json');
    if (existsSync(pkg)) {
      const main = (JSON.parse(readFileSync(pkg, 'utf8')) as { main: string }).main;
      return (await import(pathToFileURL(join(pkg, '..', main)).href)) as ShowcaseKit;
    }
    if (join(at, '..') === at) throw new Error(`@fudic/workbench is not installed in ${dir}: install the project's dependencies first`);
  }
}

/** The folder the hosts of the cases with signals go in, inside the components of the app. */
const HOSTS = 'showcase';

/** A component with a fixture: its tag, its `.fud` and its fixture, absolute. */
interface Shown {
  readonly tag: string;
  readonly fud: string;
  readonly fixture: string;
}

/** The components of the project at `root` that have a fixture, by folder name, sorted. */
function componentsOf(root: string, io: ReadIo): readonly Shown[] {
  const dir = joinPosix(root, COMPONENTS_DIR);
  return [...io.list(dir)]
    .sort()
    .map((tag) => ({ tag, fud: joinPosix(dir, tag, `${tag}.fud`), fixture: joinPosix(dir, tag, `${tag}.fixture.ts`) }))
    .filter((one) => io.exists(one.fud) && io.exists(one.fixture));
}

/** Every file of a folder, by path relative to `cwd`, with its contents. */
function filesIn(dir: string, cwd: string, io: ReadIo): [string, string][] {
  return io
    .list(dir)
    .map((name) => joinPosix(dir, name))
    .filter((path) => !io.isDirectory(path))
    .map((path) => [relativeTo(cwd, path), io.read(path)]);
}

/** A view of the disk with a plan's files already written: the app it creates, before it exists. */
function overlay(io: ReadIo, cwd: string, changes: readonly FileChange[]): ReadIo {
  const written = new Map(changes.map((change) => [toPosix(absolute(cwd, change.path)), change.contents]));
  const dirs = new Set<string>();
  for (const path of written.keys()) {
    for (let dir = dirname(path); !dirs.has(dir) && dir !== dirname(dir); dir = dirname(dir)) dirs.add(dir);
  }
  // The readers ask with every spelling of a path: relative, with `\`, with or without a drive.
  const key = (path: string): string => toPosix(absolute(cwd, path));
  return {
    exists: (path) => written.has(key(path)) || dirs.has(key(path)) || io.exists(path),
    read: (path) => written.get(key(path)) ?? io.read(path),
    isDirectory: (path) => dirs.has(key(path)) || io.isDirectory(path),
    list: (dir) => {
      const at = key(dir);
      const mine = [...written.keys(), ...dirs].filter((path) => path.startsWith(`${at}/`) && !path.slice(at.length + 1).includes('/'));
      return [...new Set([...io.list(dir), ...mine.map((path) => path.slice(at.length + 1))])];
    },
    realPath: io.realPath.bind(io),
  };
}

export async function planShowcase(
  opts: ShowcaseOptions,
  io: ReadIo = nodeReadIo(),
  kitOf: (dir: string) => Promise<ShowcaseKit> = workbenchOf,
): Promise<Plan> {
  const cwd = toPosix(absolute(opts.cwd, '.'));
  const refuse = (errors: readonly CliError[]): Plan => ({ ...EMPTY_PLAN, errors });
  const command = `fudic g showcase${opts.library === undefined ? '' : ` ${opts.library}`}${opts.app === 'showcase' ? '' : ` --app ${opts.app}`}`;

  // Where the components come from, and the app that shows them.
  let source: Project;
  let app: { readonly path: string; readonly plan: Plan };
  let fromPage: (one: Shown) => { href: string; fixture: string };
  let fromHosts: (one: Shown) => { href: string; fixture: string };
  let pages: string;
  if (opts.library === undefined) {
    const resolved = resolveTarget(opts, io);
    if (resolved.target === undefined) return refuse(resolved.errors);
    // A library has no routes to show its components in: its showcase is an app that uses it.
    const refusal = routeRefusal(resolved.target);
    if (refusal !== null) return refuse([refusal]);
    source = { name: resolved.target.dir, path: resolved.target.path, config: resolved.target.config };
    app = { path: resolved.target.path, plan: EMPTY_PLAN };
    pages = joinPosix(ROUTES_DIR, HOSTS);
    const root = resolved.target.path;
    // How a file in `dir` reaches the component and its fixture: by relative path, the fixture without `.ts`.
    const from =
      (dir: string) =>
      (one: Shown): { href: string; fixture: string } => {
        const at = joinPosix(root, dir, 'x.fud');
        return { href: hrefBetween(at, one.fud), fixture: hrefBetween(at, one.fixture).replace(/\.ts$/u, '') };
      };
    fromPage = from(pages);
    fromHosts = from(joinPosix(COMPONENTS_DIR, HOSTS));
  } else {
    const root = workspaceRoot(cwd, io) ?? cwd;
    const projects = findProjects(root, io);
    const library = projects.find((project) => project.name === opts.library && project.config.kind === 'lib');
    if (library === undefined) {
      const libraries = projects.filter((project) => project.config.kind === 'lib').map((project) => project.name);
      return refuse([FUD0455({ module: opts.library, libraries })]);
    }
    source = library;
    const pkg = packageNameOf(library, io);
    const existing = projects.find((project) => project.name === opts.app);
    const plan =
      existing === undefined
        ? await planApp(opts.app, { cwd: root, force: false, dir: 'apps', id: opts.app, prefix: prefixOf(opts.app), sw: true, uses: [opts.library], layout: { own: '_layout' } }, io)
        : await planAdd(opts.library, { cwd: root, force: false, locales: [], project: opts.app }, io);
    if (plan.errors.length > 0) return refuse(plan.errors);
    const rebased = { ...plan, changes: plan.changes.map((change) => ({ ...change, path: relativeTo(cwd, absolute(root, change.path)) })), commands: plan.commands.map((c) => ({ ...c, dir: relativeTo(cwd, absolute(root, c.dir)) || '.' })) };
    app = { path: existing?.path ?? joinPosix(root, 'apps', opts.app), plan: rebased };
    pages = ROUTES_DIR;
    const specifiers = (one: Shown): { href: string; fixture: string } => ({ href: `${pkg}/${one.tag}.fud`, fixture: `${pkg}/${one.tag}.fixture` });
    fromPage = specifiers;
    fromHosts = specifiers;
  }

  const shown = componentsOf(source.path, io);
  const kit = await kitOf(source.path);
  const executed = shown.length === 0 ? { fixtures: new Map(), diagnostics: [] } : await kit.executeFixtures(source.path, shown.map((one) => one.fixture));

  // The app as it will be once its own plan is applied: its layout, its base, its routes.
  const view = overlay(io, cwd, app.plan.changes);
  const routesDir = joinPosix(app.path, pages);
  const hostsDir = joinPosix(app.path, COMPONENTS_DIR, HOSTS);
  const index = joinPosix(routesDir, 'index.fud');
  const found = resolveLayout(index, undefined, { cwd, routesDir, layoutsDir: joinPosix(app.path, LAYOUTS_DIR) }, view);
  const layout = found.path === null ? null : (found.specifier ?? hrefBetween(index, absolute(cwd, found.path)));
  const config = findProjects(app.path, view)[0]!.config;
  const served = servedApps(findProjects(app.path, view), view)[0]!;
  const created = new Set(app.plan.changes.map((change) => change.path));
  const existing = new Map([...filesIn(routesDir, cwd, view), ...filesIn(hostsDir, cwd, view)].filter(([path]) => !created.has(path)));

  const planned = kit.planShowcase({
    command,
    components: shown
      .filter((one) => executed.fixtures.has(one.fixture))
      .map((one) => ({ tag: one.tag, ...fromPage(one), fromHosts: fromHosts(one), cases: executed.fixtures.get(one.fixture)!, file: relativeTo(cwd, one.fixture) })),
    routesDir: relativeTo(cwd, routesDir),
    hostsDir: relativeTo(cwd, hostsDir),
    hostsHref: hrefBetween(joinPosix(routesDir, 'x.fud'), hostsDir),
    layout,
    lang: config.locales[0]!,
    url: pages === ROUTES_DIR ? served.base : `${served.base}${HOSTS}/`,
    source: relativeTo(cwd, source.path) || '.',
    existing,
  });
  // A fixture that threw, or a signal no host can write down: that component cannot be shown as it is.
  const errors = [...executed.diagnostics, ...planned.errors, ...planned.diagnostics];
  if (errors.length > 0) return refuse(errors);

  // The showcase's files win over the app's own on the same path: its home page is the index.
  const ours = new Set(planned.changes.map((change) => change.path));
  return {
    ...app.plan,
    changes: [...app.plan.changes.filter((change) => !ours.has(change.path)), ...planned.changes],
    deletions: [...(app.plan.deletions ?? []), ...planned.deletions],
    report: [...(app.plan.report ?? []), '', `Showcase of ${source.name} in ${relativeTo(cwd, routesDir)}/`, ...planned.changes.map((change) => `  ${change.kind === 'create' ? 'create' : 'modify'}  ${change.path}`), ...planned.deletions.map((path) => `  delete  ${path}`)],
  };
}
