/**
 * `fudic g spec /<route>` (SDD-82 §3.10): the criteria file of a page, and its fixture with a
 * sample `data` in the shape of `LoadData`, `paths` when the route declares it, and `calls`
 * empty — every function runs for real until the fixture names it. A page without a `.fudapi`
 * gets its criteria alone.
 *
 * The route is written as the `page` header writes it, as it sits on disk (`/blog/[slug]`), and
 * looked up by the same rules the validator uses: a page that is not there is `FUD1500`, and
 * nothing is written. A page is not born from its spec: which layout and which sections it gets
 * are `fudic g page`'s to choose.
 *
 * Nothing here writes a line of its own: the `.fudspec` and the fixture are what `@fudic/spec`
 * generates, and the fields are what `@fudic/typecheck/api` reads off the route's `.fudapi`, the
 * same reader the editor uses. The reader is injected so the plan is checked without a project
 * on disk, and loaded lazily so no other command pays for it.
 */

import { API_EXTENSION } from '@fudic/api';
import { ROUTES_DIR, SRC_DIR } from '@fudic/conventions';
import { FUD1500 } from '@fudic/diagnostics';
import { SPEC_EXTENSION, findRoute, pageFixtureModule, pageFixturePathOf, pageSpecSkeleton, routeFiles, type PropField } from '@fudic/spec';
import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { resolveTarget, routeRefusal } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, Plan, SpecOptions } from '../types.js';

/** What a route's `.fudapi` says a fixture holds: the fields of `load`, and whether it declares `paths`. */
export interface RouteContract {
  /** Absent: the route declares no `load`. */
  readonly load?: readonly PropField[];
  readonly paths: boolean;
}

/** The contract of the `.fudapi` at `api` (absolute), in the project at `root`; undefined when there is none. */
export type ContractReader = (root: string, api: string) => Promise<RouteContract | undefined>;

/** The project's `.fudapi`, read for the one question. */
export const fudapiContract: ContractReader = async (root, api) => {
  const { loadFields, readApiProject } = await import('@fudic/typecheck/api');
  const files = readApiProject(root);
  const source = files.byPath.get(api);
  if (source === undefined) return undefined;
  const load = loadFields(source, files.index);
  return { ...(load !== undefined ? { load } : {}), paths: source.file.declarations.some((d) => d.kind === 'paths') };
};

/** The key of the `data` entry a new page fixture gets, and the one the skeleton names. */
export const BASE_DATA = 'base';

export async function planPageSpec(route: string, opts: SpecOptions, io: ReadIo = nodeReadIo(), read: ContractReader = fudapiContract): Promise<Plan> {
  const fail = (error: CliError): Plan => ({ changes: [], commands: [], diagnostics: [], errors: [error] });
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return { changes: [], commands: [], diagnostics: [], errors: resolved.errors };
  const project = resolved.target;
  const refusal = routeRefusal(project);
  if (refusal !== null) return fail(refusal);

  const routesDir = joinPosix(project.path, ROUTES_DIR);
  const fs = { readDirectory: (path: string) => (io.isDirectory(path) ? io.list(path) : []) };
  const page = findRoute(routeFiles(fs, routesDir), route);
  if (page === undefined) return fail(FUD1500({ file: joinPosix(project.dir, ROUTES_DIR), route }));

  const stem = page.path.slice(0, -'.fud'.length);
  const contract = await read(project.path, `${stem}${API_EXTENSION}`);
  const load = contract?.load;
  const paths = contract?.paths === true;
  // The project-relative forms a `FileChange` carries, and the route's module id (`routes/usuarios`).
  const relative = stem.slice(project.path.length + 1);
  const id = stem.slice(joinPosix(project.path, SRC_DIR).length + 1);

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  const given = {
    ...(load !== undefined ? { data: BASE_DATA } : {}),
    ...(page.params.length > 0 ? { params: paths ? ('path' as const) : ('url' as const) } : {}),
  };
  const spec = targetChange(opts.cwd, joinPosix(project.dir, `${relative}${SPEC_EXTENSION}`), pageSpecSkeleton(page.route, given), opts.force, io);
  if (spec.error !== undefined) errors.push(spec.error);
  if (spec.change !== undefined) changes.push(spec.change);

  // A page with no `.fudapi` has nothing to fake (no `load`, no `paths`, no function of its own)
  // and no `Fixtures` to type a fixture by: only its criteria. An existing fixture already has
  // its entries, and the values someone chose: it is kept.
  if (contract !== undefined && !io.exists(pageFixturePathOf(page.path))) {
    const parts = { ...(load !== undefined ? { data: { name: BASE_DATA, fields: load } } : {}), paths };
    changes.push({ kind: 'create', path: joinPosix(project.dir, pageFixturePathOf(`${relative}.fud`)), contents: pageFixtureModule(id, parts) });
  }
  return { changes, commands: [], diagnostics: [], errors };
}
