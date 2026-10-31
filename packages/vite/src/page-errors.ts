/**
 * What a navigation answers when `load` or `layout` throws (SDD-56 §4.8).
 *
 * | Thrown       | Answer                                                              |
 * |--------------|---------------------------------------------------------------------|
 * | `Redirect`   | its status and `Location`                                           |
 * | `HttpError`  | `_error.fud` painted with its status and `{ status, title, detail }` |
 * | anything else| the same, as a 500 — and in dev, the overlay                        |
 *
 * Read by SHAPE, `status` and `problem`: the classes are `@fudic/http`'s, a package this plugin
 * does not depend on, and the app's own copy of them is the one that threw.
 *
 * `_error.fud` has no URL of its own but `/_fudic/error/:status` and is not in the route table:
 * `errorPages` navigates there, and the server paints it. A path no route matches is painted
 * with it too, as a `404`.
 */

import { STATUS_CODES } from 'node:http';
import { ERROR_PREFIX } from '@fudic/conventions';
import { escapeText } from '@fudic/ssr';
import type { RenderModule } from './serve.js';
import { drainStream, edgeContext } from './serve.js';

/** The pattern `_error.fud` is compiled and rendered under. */
export const ERROR_PATTERN = `${ERROR_PREFIX}/:status`;

/** The `data` of `_error.fud`. */
export interface PageProblem {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
}

export type PageError =
  | { readonly kind: 'redirect'; readonly status: number; readonly location: string }
  | { readonly kind: 'error'; readonly problem: PageProblem; readonly unexpected: boolean };

interface HttpErrorShape {
  readonly status: number;
  readonly problem: { readonly status: number; readonly title: string; readonly detail?: string };
  readonly location?: unknown;
}

const isHttpError = (e: unknown): e is HttpErrorShape =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as { status?: unknown }).status === 'number' &&
  typeof (e as { problem?: unknown }).problem === 'object';

/** What a thrown value means for a navigation. Only in dev does a 500 carry its message. */
export function classifyError(e: unknown, dev: boolean): PageError {
  if (isHttpError(e)) {
    if (typeof e.location === 'string' && e.status >= 300 && e.status < 400) {
      return { kind: 'redirect', status: e.status, location: e.location };
    }
    const { status, title, detail } = e.problem;
    return { kind: 'error', problem: detail === undefined ? { status, title } : { status, title, detail }, unexpected: false };
  }
  const detail = e instanceof Error ? e.message : String(e);
  return {
    kind: 'error',
    problem: { status: 500, title: 'Internal Server Error', ...(dev ? { detail } : {}) },
    unexpected: true,
  };
}

/**
 * The `data` of `/_fudic/error/<status>`, out of the status alone. Nothing of its query reaches
 * the page (SDD-73 §3.6): a link anyone can write must not paint their text with the app's design.
 */
export function problemOfStatus(status: number): PageProblem {
  return { status, title: STATUS_CODES[status] ?? 'Error' };
}

/** Where the error page was asked from (SDD-73 §3.6): the path that failed, and the way back. */
export interface PageOrigin {
  /** The path asked for, without the origin or the `base`: `/usuarios/99`. */
  readonly path: string;
  /** Where the user came from, when it is of this app: `/usuarios?p=2`. */
  readonly back?: string;
}

/** `pathname` without `base`, or `null` when it is not under it. */
export function withoutBase(pathname: string, base: string): string | null {
  const prefix = base.replace(/\/$/u, '');
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
  return pathname.slice(prefix.length) || '/';
}

/**
 * The way back the `Referer` gives, or `undefined`. Resolved and compared by ORIGIN, never by
 * its text: `/\evil.com` starts with `/` and a browser reads it as `//evil.com`. A path that
 * resolves to two slashes is another host's too, and so is one outside the app's `base`.
 */
export function backOf(referer: string | null, origin: string, base: string): string | undefined {
  if (referer === null || !URL.canParse(referer)) return undefined;
  const url = new URL(referer);
  if (url.origin !== origin) return undefined;
  const path = withoutBase(url.pathname, base);
  return path === null || path.startsWith('//') ? undefined : path + url.search;
}

/**
 * Where a request that ends on the error page came from. `fromCall` is `/_fudic/error/:status`,
 * where `errorPages` brought the browser after a call failed: the page that made the call is
 * the `Referer`, and it is the path that failed as well as the way back.
 */
export function pageOriginOf(request: Request, base: string, fromCall: boolean): PageOrigin {
  const url = new URL(request.url);
  const back = backOf(request.headers.get('referer'), url.origin, base);
  const asked = fromCall && back !== undefined ? new URL(back, url.origin).pathname : url.pathname;
  const path = withoutBase(asked, base) ?? asked;
  return back === undefined ? { path } : { path, back };
}

/**
 * The `Referrer-Policy` of a page (SDD-73 §3.6): the whole `Referer` within the origin and only
 * the origin outside it. Stated so a stricter default of a server does not leave `back` empty.
 */
export const PAGE_REFERRER_POLICY = 'strict-origin-when-cross-origin';

/** The page of a project without `_error.fud`: the status and its title, and nothing else. */
export function minimalErrorPage(problem: PageProblem): string {
  const title = escapeText(`${problem.status} ${problem.title}`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${escapeText(String(problem.status))}</h1><p>${escapeText(problem.title)}</p></body></html>`;
}

/**
 * `_error.fud` rendered with `problem` and where it was asked from, or the minimal page when
 * the project has none.
 */
export async function renderErrorPage(
  mod: RenderModule | null,
  problem: PageProblem,
  nonce: string,
  origin: PageOrigin,
): Promise<string> {
  if (mod === null) return minimalErrorPage(problem);
  const data = { ...problem, ...origin };
  const ctx = { ...edgeContext(ERROR_PATTERN, `${ERROR_PREFIX}/${problem.status}`, nonce), data };
  return drainStream(mod.render(ctx));
}
