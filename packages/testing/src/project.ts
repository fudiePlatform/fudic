/**
 * The project under test as `vite dev` sees it: its root, its `base`, its routes and its
 * `_error.fud`, discovered once per test file with the plugin's own routing (§4.9).
 */

import { ApiProject, discoverRoutes, httpFileOf, resolveOptions, type FudicOptions, type RouteBuild } from '@fudic/vite/harness';
import { inject } from 'vitest';
import { OPTIONS_KEY, ROOT_KEY } from './constants.js';

declare module 'vitest' {
  export interface ProvidedContext {
    fudicOptions: FudicOptions & { readonly base: string };
  }
}

export interface Project {
  readonly root: string;
  readonly base: string;
  readonly routes: readonly RouteBuild[];
  /** `_error.fud`, when the project has one. */
  readonly errorPage: RouteBuild | undefined;
  /** `src/http.ts`, the global level of the chain, when the project has one. */
  readonly httpFile: string | undefined;
  /** Whether the app declares a `.fudapi` of its own: only then is there a server root (SDD-60 §4.4). */
  readonly api: boolean;
}

let project: Project | undefined;

/** The project of this test run. */
export function projectOf(): Project {
  if (project === undefined) {
    const root = inject(ROOT_KEY);
    const { base, ...options } = inject(OPTIONS_KEY);
    const found = discoverRoutes(root, resolveOptions(options, base).options);
    const api = new ApiProject(root).sources.some((source) => source.origin === 'app');
    project = { root, base, routes: found.routes, errorPage: found.errorPage, httpFile: httpFileOf(root), api };
  }
  return project;
}
