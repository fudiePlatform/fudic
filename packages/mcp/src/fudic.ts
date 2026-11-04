/**
 * The fudic the answers are made with: the one the project installed, so the chat is told what
 * its build will say; the server's own only when the project has none.
 *
 * The project depends on `@fudic/vite`, and the checker is what that `@fudic/vite` resolves:
 * found as Node finds a package, from the folder of the one that depends on it.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Typecheck = typeof import('@fudic/typecheck');
type TypecheckApi = typeof import('@fudic/typecheck/api');

/** The machines a tool calls, and whose they are. */
export interface Fudic {
  readonly createProjectChecker: Typecheck['createProjectChecker'];
  readonly writeApiDeclarations: TypecheckApi['writeApiDeclarations'];
  /** `project` when they are the project's own install. */
  readonly from: 'project' | 'server';
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
async function projectFudic(root: string, load: Importer): Promise<Fudic | undefined> {
  const vite = packageDir('@fudic/vite', root);
  const typecheck = vite === undefined ? undefined : packageDir('@fudic/typecheck', vite);
  if (typecheck === undefined) return undefined;
  const main = exportedFile(typecheck, '.');
  const api = exportedFile(typecheck, './api');
  // An install older than this server has no `./api`: it cannot answer as the build would.
  if (main === undefined || api === undefined) return undefined;
  const checker = (await load(pathToFileURL(main).href)) as Typecheck;
  const declarations = (await load(pathToFileURL(api).href)) as TypecheckApi;
  return {
    createProjectChecker: checker.createProjectChecker,
    writeApiDeclarations: declarations.writeApiDeclarations,
    from: 'project',
  };
}

/** The fudic of the project at `root`, or the server's own. */
export async function loadFudic(root: string, load: Importer = (url) => import(url)): Promise<Fudic> {
  const own = await projectFudic(root, load);
  if (own !== undefined) return own;
  const checker = await import('@fudic/typecheck');
  const declarations = await import('@fudic/typecheck/api');
  return {
    createProjectChecker: checker.createProjectChecker,
    writeApiDeclarations: declarations.writeApiDeclarations,
    from: 'server',
  };
}
