/**
 * The in-memory server (§4.6): the dev server's table of functions, read through vitest's
 * graph, behind `@fudic/http`'s own `functionsHandler`.
 *
 * Every `?server` module is imported by vitest, so a `vi.mock` of the test reaches what it
 * imports (§4.1). The table is the one `devSource` arms for `vite dev`; only the loader is the
 * harness's. A request resolves from a fresh container with the test's overrides in it.
 */

import { createRoot } from '@fudic/di';
import { functionsHandler, type FnSource } from '@fudic/http/server';
import { devSource, discoverRoutes, httpFileOf, resolveOptions, type FudicOptions } from '@fudic/vite/harness';
import { inject } from 'vitest';
import { OPTIONS_KEY, ROOT_KEY } from './constants.js';
import { overridden } from './providers.js';

declare module 'vitest' {
  export interface ProvidedContext {
    fudicOptions: FudicOptions & { readonly base: string };
  }
}

/** The components a page of the test reached, by tag: their functions answer at `/c/<tag>/`. */
const components = new Map<string, string>();

/** Note the components of a page the harness painted, so their functions can be called. */
export function knowComponents(found: Iterable<{ readonly tag: string; readonly path: string }>): void {
  for (const { tag, path } of found) components.set(tag, path);
}

/** Import a module by id through vitest's graph. */
const load = (id: string): Promise<Record<string, unknown>> => import(/* @vite-ignore */ id) as Promise<Record<string, unknown>>;

let handler: ((request: Request) => Promise<Response | null>) | undefined;

/** The handler of `/_fudic/fn/`, armed once per test file. */
export function functions(): (request: Request) => Promise<Response | null> {
  if (handler === undefined) {
    const root = inject(ROOT_KEY);
    const { base, ...options } = inject(OPTIONS_KEY);
    const builds = discoverRoutes(root, resolveOptions(options, base).options).routes;
    // Typed loosely on the plugin's side, which loads `@fudic/http` from the project's graph and
    // does not depend on it: what it reads is a module's exports, which is what `FnSource` names.
    const source = devSource({ builds, componentPath: (tag) => components.get(tag), load, httpFile: httpFileOf(root) }) as FnSource;
    handler = functionsHandler(source, { base, dev: true, container: () => overridden(createRoot()) });
  }
  return handler;
}
