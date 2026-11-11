/**
 * What a `.fudspec` of a page or a flow can call, read off the project's `.fudapi` (SDD-82 §8.2.9):
 * the `reach` and `functions` of a `SpecIo`. One reader for the project check and the editor, so
 * `FUD1506`, `FUD1507` and `FUD1513` say the same thing in both.
 *
 * The answer is `@fudic/api`'s (`routeCallables`, `projectCallables`), the same that writes the
 * `Calls` of the route's `.d.ts`: a name the fixture may answer is a name a criterion may ask about.
 */

import { API_EXTENSION, linkedComponents, projectCallables, routeCallables, type ApiIndex, type ApiSource, type Callable } from '@fudic/api';
import { ROUTES_DIR, SRC_DIR } from '@fudic/conventions';
import type { FunctionInfo, PageReach, SpecIo } from '@fudic/spec';

/** What the answers are read from: the project's sources by path, their index, and any file's text. */
export interface SpecReachInput {
  /** The project's folder, POSIX-shaped. */
  readonly root: string;
  readonly index: ApiIndex;
  /** A `.fudapi` of the project by its absolute path. */
  source(path: string): ApiSource | undefined;
  /** The text of a file; undefined when it is not there. */
  read(path: string): string | undefined;
}

const PARAM = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/u;

/** The names of the params of the page at `page`, a `.fud` of the routes folder of `root`. */
export function routeParams(root: string, page: string): readonly string[] {
  const routes = `${root}/${ROUTES_DIR}/`;
  return page
    .slice(routes.length, -'.fud'.length)
    .split('/')
    .flatMap((s) => PARAM.exec(s)?.[1] ?? []);
}

/**
 * The `<id>` of the `.fudapi` of each component `page` links by a path of the app (SDD-82
 * §8.2.7): a component with no `.fudapi` beside it, or one outside `src/`, brings no function.
 */
export function linkedComponentIds(root: string, page: string, text: string, has: (api: string) => boolean): readonly string[] {
  const src = `${root}/${SRC_DIR}/`;
  return linkedComponents(page, text)
    .map((fud) => fud.slice(0, -'.fud'.length))
    .filter((stem) => stem.startsWith(src) && has(`${stem}${API_EXTENSION}`))
    .map((stem) => stem.slice(src.length));
}

const infoOf = ({ name, args, path, span }: Callable): FunctionInfo => ({ name, args, path, span });

/** The `reach` and `functions` of a `SpecIo` for the project of `input`. */
export function specReach(input: SpecReachInput): Required<Pick<SpecIo, 'reach' | 'functions'>> {
  const { root, index } = input;
  return {
    reach: (page): PageReach => {
      const source = input.source(`${page.slice(0, -'.fud'.length)}${API_EXTENSION}`);
      const components = linkedComponentIds(root, page, input.read(page) ?? '', (api) => input.source(api) !== undefined);
      const callables = routeCallables(index, { ...(source !== undefined ? { source } : {}), components, params: routeParams(root, page) });
      return {
        paths: source?.file.declarations.some((d) => d.kind === 'paths') === true,
        functions: callables.map(infoOf),
      };
    },
    functions: () => projectCallables(index).map(infoOf),
  };
}
