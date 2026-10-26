/**
 * The project under test as `vite dev` sees it: its root, its `base`, its routes and its
 * `_error.fud`, discovered once per test file with the plugin's own routing (§4.9), and the
 * locale a module is compiled for when the app has `locales` (SDD-58 §4.6).
 */

import { dirname, resolve } from 'node:path';
import {
  ApiProject,
  discoverRoutes,
  nodeConfigIo,
  readProject,
  resolveOptions,
  withLocale,
  type FudicOptions,
  type RouteBuild,
} from '@fudic/vite/harness';
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
  /** Whether the app declares a `.fudapi` of its own: only then is there a server root (SDD-60 §4.4). */
  readonly api: boolean;
  /**
   * The app's first locale, when it has `locales`: what a component is mounted in. Without it,
   * `a | preset` is not a pipe and `t()` is not translated — the module `vite dev` serves a
   * page of the app is always compiled for a locale.
   */
  readonly locale: string | undefined;
}

let project: Project | undefined;

/** The project of this test run. */
export function projectOf(): Project {
  if (project === undefined) {
    const root = inject(ROOT_KEY);
    const { base, ...options } = inject(OPTIONS_KEY);
    const locales = readProject(root, false, nodeConfigIo()).config?.locales;
    // What each route's `.fudapi` declares, as the plugin reads it: `load`, `paths`, `layout`.
    const contracts = new ApiProject(root);
    const found = discoverRoutes(root, resolveOptions(options, base).options, locales, (fud) => (href) =>
      contracts.page(resolve(dirname(fud), href)),
    );
    const api = contracts.sources.some((source) => source.origin === 'app');
    project = { root, base, routes: found.routes, errorPage: found.errorPage, api, locale: locales?.[0] };
  }
  return project;
}

/** `id` as the module compiled for `locale` — the project's, unless named — or as it is for none. */
export function localized(id: string, locale = projectOf().locale): string {
  return locale === undefined ? id : withLocale(id, locale);
}
