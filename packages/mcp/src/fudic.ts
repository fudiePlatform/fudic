/**
 * The fudic the answers are made with: the one the project installed, so the chat is told what
 * its build and its CLI will say; the server's own only when the project has none.
 *
 * The project depends on `@fudic/vite` and `@fudic/cli`. The checker is what that `@fudic/vite`
 * resolves, found as Node finds a package, from the folder of the one that depends on it.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Typecheck = typeof import('@fudic/typecheck');
type TypecheckApi = typeof import('@fudic/typecheck/api');
export type Cli = typeof import('@fudic/cli');

/** The machines a tool calls, and whose they are. */
export interface Fudic {
  readonly createProjectChecker: Typecheck['createProjectChecker'];
  readonly writeApiDeclarations: TypecheckApi['writeApiDeclarations'];
  readonly cli: Cli;
  /** Whose each one is: the project's own install, or this server's. */
  readonly from: { readonly check: 'project' | 'server'; readonly cli: 'project' | 'server' };
}

/** Imports a module by its file URL. */
export type Importer = (url: string) => Promise<unknown>;

/** The folder of `name` as Node resolves it from `from`; undefined when it is not installed. */
export function packageDir(name: string, from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(dir) === dir) return undefined;
  }
}

/** The file a subpath of a package exports for `import`, read off its `package.json`. */
export function exportedFile(dir: string, subpath: string): string | undefined {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    readonly exports?: Readonly<Record<string, { readonly import?: string } | string>>;
  };
  const entry = manifest.exports?.[subpath];
  const file = typeof entry === 'string' ? entry : entry?.import;
  return file === undefined ? undefined : join(dir, file);
}

/** The project's typecheck, through its `@fudic/vite`; undefined when it has neither. */
async function projectCheck(root: string, load: Importer): Promise<{ main: Typecheck; api: TypecheckApi } | undefined> {
  const vite = packageDir('@fudic/vite', root);
  const typecheck = vite === undefined ? undefined : packageDir('@fudic/typecheck', vite);
  if (typecheck === undefined) return undefined;
  const main = exportedFile(typecheck, '.');
  const api = exportedFile(typecheck, './api');
  // An install older than this server has no `./api`: it cannot answer as the build would.
  if (main === undefined || api === undefined) return undefined;
  return { main: (await load(pathToFileURL(main).href)) as Typecheck, api: (await load(pathToFileURL(api).href)) as TypecheckApi };
}

/** The project's CLI; undefined when it has none. */
async function projectCli(root: string, load: Importer): Promise<Cli | undefined> {
  const dir = packageDir('@fudic/cli', root);
  const main = dir === undefined ? undefined : exportedFile(dir, '.');
  if (main === undefined) return undefined;
  const cli = (await load(pathToFileURL(main).href)) as Partial<Cli>;
  // An install older than this server cannot plan in process: the server's own CLI does.
  return typeof cli.planOf === 'function' && typeof cli.needsShell === 'function' ? (cli as Cli) : undefined;
}

type TestingRun = typeof import('@fudic/testing/run');
type Workbench = typeof import('@fudic/workbench');

/** What runs the project's tests and criteria: always its own, with its vitest and its browser. */
export interface Runners {
  readonly runTests?: TestingRun['runTests'];
  readonly runSpecs?: Workbench['runSpecs'];
}

/** The runners the project installed; a missing one is absent, and its tool says so. */
export async function loadRunners(root: string, load: Importer = (url) => import(url)): Promise<Runners> {
  const testing = packageDir('@fudic/testing', root);
  const tests = testing === undefined ? undefined : exportedFile(testing, './run');
  const workbench = packageDir('@fudic/workbench', root);
  const specs = workbench === undefined ? undefined : exportedFile(workbench, '.');
  const runTests = tests === undefined ? undefined : ((await load(pathToFileURL(tests).href)) as TestingRun).runTests;
  const runSpecs = specs === undefined ? undefined : ((await load(pathToFileURL(specs).href)) as Workbench).runSpecs;
  return { ...(runTests !== undefined ? { runTests } : {}), ...(runSpecs !== undefined ? { runSpecs } : {}) };
}

/** The fudic of the project at `root`, or the server's own, piece by piece. */
export async function loadFudic(root: string, load: Importer = (url) => import(url)): Promise<Fudic> {
  const ownCheck = await projectCheck(root, load);
  const check = ownCheck ?? { main: await import('@fudic/typecheck'), api: await import('@fudic/typecheck/api') };
  const ownCli = await projectCli(root, load);
  return {
    createProjectChecker: check.main.createProjectChecker,
    writeApiDeclarations: check.api.writeApiDeclarations,
    cli: ownCli ?? (await import('@fudic/cli')),
    from: { check: ownCheck === undefined ? 'server' : 'project', cli: ownCli === undefined ? 'server' : 'project' },
  };
}
