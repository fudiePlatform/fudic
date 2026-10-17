/**
 * Where each app of a workspace is served (BUG-50 §4.5): its base URL and its own dev port.
 *
 * Both live in the app's `vite.config.ts`, because the base IS Vite's — it already reaches the
 * Service Worker and every URL the build derives — and `fudic.json` refuses a path. They are
 * read back with a pattern over the file `g app` wrote: an app with no `base` is `/`, one with no
 * `server.port` is on Vite's default.
 */

import { joinPosix } from '../paths.js';
import type { ReadIo } from '../io.js';
import type { Project } from './discover.js';

/** Vite's own default dev port. */
export const DEV_PORT = 5173;

/** An app of the workspace and where it is served. */
export interface ServedApp {
  readonly name: string;
  /** Absolute, POSIX. */
  readonly path: string;
  /** Normalized: `/` or `/admin/`. */
  readonly base: string;
  /** The port `pnpm --filter <name> dev` listens on. */
  readonly port: number;
}

const BASE = /\bbase:\s*['"]([^'"]*)['"]/u;
const PORT = /\bport:\s*(\d+)/u;

/** `admin`, `/admin` or `admin/` → `/admin/`; `''` → `/`. */
export function normalizeBase(raw: string): string {
  const trimmed = raw.replace(/^\/+|\/+$/gu, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/** Every app of `projects`, with its base and port, longest base first: the order a request is matched in. */
export function servedApps(projects: readonly Project[], io: ReadIo): readonly ServedApp[] {
  return projects
    .filter((project) => project.config.kind === 'app')
    .map((project) => {
      const file = joinPosix(project.path, 'vite.config.ts');
      const source = io.exists(file) ? io.read(file) : '';
      const base = BASE.exec(source)?.[1];
      const port = PORT.exec(source)?.[1];
      return {
        name: project.name,
        path: project.path,
        base: normalizeBase(base ?? '/'),
        port: port === undefined ? DEV_PORT : Number(port),
      };
    })
    .sort((a, b) => b.base.length - a.base.length || a.name.localeCompare(b.name));
}

/** The app a request path goes to: the one with the longest base it starts with. */
export function appFor<T extends { readonly base: string }>(apps: readonly T[], pathname: string): T | undefined {
  return [...apps]
    .sort((a, b) => b.base.length - a.base.length)
    .find((app) => pathname === app.base.slice(0, -1) || pathname.startsWith(app.base));
}

/** The app a hint names as "your app": the one at `/`, else the first there is; none in a workspace with no app. */
export function mainApp(projects: readonly Project[], io: ReadIo): string | undefined {
  const apps = servedApps(projects, io);
  return (apps.find((app) => app.base === '/') ?? apps[0])?.name;
}
