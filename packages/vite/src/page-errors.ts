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
 * `errorPages` navigates there, and the server paints it.
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

/** The `data` of `/_fudic/error/<status>`, out of the status alone. */
export function problemOfStatus(status: number): PageProblem {
  return { status, title: STATUS_CODES[status] ?? 'Error' };
}

/** The page of a project without `_error.fud`: the status and its title, and nothing else. */
export function minimalErrorPage(problem: PageProblem): string {
  const title = escapeText(`${problem.status} ${problem.title}`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${escapeText(String(problem.status))}</h1><p>${escapeText(problem.title)}</p></body></html>`;
}

/** `_error.fud` rendered with `problem`, or the minimal page when the project has none. */
export async function renderErrorPage(
  mod: RenderModule | null,
  problem: PageProblem,
  nonce: string,
): Promise<string> {
  if (mod === null) return minimalErrorPage(problem);
  const ctx = { ...edgeContext(ERROR_PATTERN, `${ERROR_PREFIX}/${problem.status}`, nonce), data: problem };
  return drainStream(mod.render(ctx));
}
