/**
 * The contract between `createServer` and whoever mounts it (SDD-81 §3.10): what an app is
 * made of, how the server is configured, and what it answers.
 */

import type { Spool, UploadLimits } from '@fudic/http/server';
import type { ManifestHeaders } from '@fudic/transport';
import type { RenderModule } from './render.js';

/** One route of the app, most specific first in the list `routes()` gives. */
export interface AppRoute {
  /** `/blog/:slug`, the locale's prefix included in an app with two or more. */
  readonly pattern: string;
  /** Whether the server can render it on demand: it has a render module. */
  readonly renders: boolean;
  /** Its `Link` values, for the `103` and the final response (SDD-73). */
  hints(): Promise<readonly string[]>;
}

/** `_error.fud` of a locale, loaded. */
export interface ErrorPage {
  readonly module: RenderModule;
  /** Its `Link` values: what a response that paints it announces. */
  readonly hints: readonly string[];
}

/** What the server root's `handler` takes (SDD-60 §4.4), as the server hands it over. */
export interface FunctionsOptions {
  readonly base: string;
  readonly dev: boolean;
  /** The workbench's own build: its criteria's calls are the bench's (SDD-82 §4.7). */
  readonly bench?: boolean;
  readonly onError?: (error: unknown) => void;
  /** The default `Secure` of the cookies a function sets (SDD-81 §3.11). */
  readonly secureCookies: boolean;
  /** What the CSRF token is signed with (SDD-81 §3.13). */
  readonly secret?: string;
  readonly uploads?: Partial<UploadLimits>;
  readonly spool?: () => Spool;
}

/** A Request in, a Response out, `null` when the URL is not the handler's. */
export type Handler = (request: Request) => Promise<Response | null>;

/** What the server serves: where its routes, modules and pages come from. */
export interface ServerApp {
  /** Vite's `base`, with its trailing slash. */
  readonly base: string;
  /** The app's locales; empty, or one, when its URLs carry no prefix. */
  readonly locales: readonly string[];
  /**
   * The app's headers (SDD-84 §3.7): `page.headers` for every page and `_error`, `sw.headers` for
   * the worker, `assets.headers` for the static files. Read on each response: dev changes them.
   */
  readonly headers: ManifestHeaders;
  /**
   * The app's own files that govern updates, by path without `base` (SDD-20 §4.11): always
   * `no-cache`, whatever `assets.headers` says, and the worker with `sw.headers` and the app's
   * scope. Absent: none — dev serves its own.
   */
  readonly files?: { readonly manifest: string; readonly worker?: string };
  /** The routes, most specific first. Asked on each request: dev adds and removes files. */
  routes(): readonly AppRoute[];
  /** A route's render module, by pattern. */
  module(pattern: string): Promise<RenderModule>;
  /** The error page of a locale, or `null` for the minimal page. */
  errorPage(locale: string | undefined): Promise<ErrorPage | null>;
  /** The prerendered HTML of a concrete path (without `base`), or `null`. */
  prerendered(pathname: string): Promise<string | null>;
  /** The server root's handler factory: functions, remote rules, the CSRF token. Absent: none. */
  readonly functions?: (options: FunctionsOptions) => Handler;
}

/** How the server is mounted. Everything is optional, and the defaults are production's. */
export interface ServerOptions {
  /** A 500 carries its message, and the CSRF secret may be random. Never in production. */
  readonly dev?: boolean;
  /**
   * The workbench's own build (SDD-82 §4.7): a request that carries one of its criteria is
   * answered by the bench, as in dev, and painted on demand. Never in a build made for anything
   * else; without the bench installed in the process it changes nothing.
   */
  readonly bench?: boolean;
  /** Read `Forwarded` / `X-Forwarded-*` to know the public URL (SDD-81 §3.12). Default false. */
  readonly trustProxy?: boolean;
  /** The default `Secure` of every cookie fudic or the app sets (SDD-81 §3.11). Default true. */
  readonly secureCookies?: boolean;
  /** Signs the CSRF token (SDD-81 §3.13). In dev without one: random per process. */
  readonly secret?: string;
  readonly uploads?: Partial<UploadLimits>;
  /** Where an upload waits while its handler runs (SDD-81 §3.5). Default: memory. */
  readonly spool?: () => Spool;
  /** Told about every error that is not an `HttpError`: in dev, the overlay. */
  readonly onError?: (error: unknown) => void;
  /**
   * Before a page is rendered. Dev refuses a page whose graph has errors by throwing here, and
   * the throw is `fetch`'s rejection: the page is not served at all.
   */
  readonly prepare?: (route: AppRoute) => Promise<void>;
  /**
   * The HTML before it goes out: the whole page (`whole`), or its head when the rest streams
   * behind it. Dev injects its client here. `url` is the path without `base`, query included.
   */
  readonly transformHtml?: (url: string, html: string, whole: boolean) => Promise<string>;
}

/** What a `103 Early Hints` may say before the response (SDD-73 §3.2). */
export interface EarlyHints {
  readonly link: readonly string[];
  /** Of `page.headers`, only these two, with the nonce the final response carries (SDD-84 §4.1). */
  readonly 'content-security-policy'?: string;
  readonly 'referrer-policy'?: string;
}

/** What whoever mounts the server may be told while `fetch` works. */
export interface FetchHooks {
  /** Called at most once, before the answer, when there is something to hint. */
  readonly earlyHints?: (hints: EarlyHints) => void;
}

export interface FudicServer {
  /** The response, or `null` when the URL is not the app's: a static file, which the host serves. */
  fetch(request: Request, hooks?: FetchHooks): Promise<Response | null>;
  /**
   * `_error.fud` as a `404`, for a navigation nothing answered — the host calls it after its own
   * files. `null` for anything that is not a `GET` or `HEAD` asking for HTML.
   */
  notFound(request: Request, hooks?: FetchHooks): Promise<Response | null>;
  /**
   * The headers of one of the app's static files (SDD-84 §4.4), or `null` when there are none. A
   * `''` value is a header that must not go out, even if the host's static server writes one.
   */
  staticHeaders(request: Request): Readonly<Record<string, string>> | null;
}
