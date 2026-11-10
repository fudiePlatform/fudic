/**
 * A fudic app, served from a `Request` to a `Response` (SDD-81 §3.10).
 *
 * The same code answers in dev, in `vite preview` and behind any adapter: what changes between
 * them is the `ServerApp` — where routes, modules and pages come from — and a few hooks of dev.
 * What it answers, in order:
 *
 *  1. with `trustProxy`, the public URL first (§3.12): everything after sees it;
 *  2. functions, remote rules and the CSRF token, by the server root's handler;
 *  3. only `GET` and `HEAD` go on;
 *  4. a page asked without its locale prefix: a redirect to the language that fits (SDD-58);
 *  5. a route's data endpoint (SDD-20 §4.5);
 *  6. (a page goes to any GET, as a static host serves a file; only `notFound` asks for HTML);
 *  7. `_error.fud` at its own URL (SDD-56 §4.8);
 *  8. a route: its prerendered HTML with the nonce stamped, or its render as it comes.
 *
 * `null` for anything else: a static file, the host's.
 */

import { CSRF_PATH, DATA_PREFIX, ERROR_PREFIX, FN_PREFIX, RULE_PREFIX } from '@fudic/conventions';
import { applyNonce, cspFor, newNonce } from '@fudic/transport';
import {
  classifyError,
  PAGE_REFERRER_POLICY,
  pageOriginOf,
  problemOfStatus,
  renderErrorPage,
  type PageError,
  type PageOrigin,
  type PageProblem,
} from './errors.js';
import { errorLocaleOf, localeOfPath, localeRedirect, withoutLocalePrefix } from './locale.js';
import { publicRequest } from './proxy.js';
import { matchesPattern, pageData, renderPage, type OpenedPage } from './render.js';
import { pendingResponse, type ServerSettings } from './response.js';
import type { AppRoute, FetchHooks, FudicServer, Handler, ServerApp, ServerOptions } from './types.js';

/** What the data endpoint answers with (SDD-70 §3.7). */
const FRAMES_TYPE = 'application/fud+frames';

const HTML_TYPE = 'text/html; charset=utf-8';

/** 32 random bytes, base64url: the CSRF secret of a dev process that was given none. */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

/** The 404 of a URL under `/_fudic/fn/` in an app without functions. */
function noFunction(): Response {
  return new Response(JSON.stringify({ status: 404, title: 'Not Found', detail: 'no such server function' }), {
    status: 404,
    headers: { 'content-type': 'application/problem+json' },
  });
}

/** The first route whose pattern matches `pathname`: the list is most specific first. */
export function matchRoute(routes: readonly AppRoute[], pathname: string): AppRoute | null {
  return routes.find((route) => matchesPattern(route.pattern, pathname)) ?? null;
}

/** `base` + `path`, a double slash collapsed: `/app/` + `/en` → `/app/en`. */
const underBase = (base: string, path: string): string => `${base}${path}`.replace(/\/{2,}/gu, '/');

/** A stream that sends `head`, then `rest` as it comes; an error after the first byte is reported. */
function pageBody(head: string, opened: OpenedPage, onError: ((error: unknown) => void) | undefined): ReadableStream<Uint8Array> {
  const rest = opened.rest[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(head));
    },
    async pull(controller) {
      try {
        const next = await rest.next();
        if (next.done === true) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        // After the first byte the status is out (SDD-70 §3.4): what fails now is only reported.
        onError?.(error);
        controller.close();
      }
    },
    cancel() {
      opened.cancel();
    },
  });
}

export function createServer(app: ServerApp, options: ServerOptions = {}): FudicServer {
  const dev = options.dev === true;
  const secret = options.secret ?? (dev ? randomSecret() : undefined);
  const settings: ServerSettings = {
    secureCookies: options.secureCookies ?? true,
    ...(secret !== undefined ? { secret } : {}),
  };
  const root = app.base.replace(/\/$/u, '');
  const functions: Handler | undefined = app.functions?.({
    base: app.base,
    dev,
    secureCookies: settings.secureCookies,
    ...(secret !== undefined ? { secret } : {}),
    ...(options.onError !== undefined ? { onError: options.onError } : {}),
    ...(options.uploads !== undefined ? { uploads: options.uploads } : {}),
    ...(options.spool !== undefined ? { spool: options.spool } : {}),
  });
  const { locales } = app;

  /** The path without `base`, so routes are matched at root. */
  const pathOf = (url: URL): string => (url.pathname.startsWith(app.base) ? url.pathname.slice(app.base.length - 1) : url.pathname);

  const isFunctionPath = (pathname: string): boolean =>
    pathname.startsWith(`${root}${FN_PREFIX}/`) || pathname.startsWith(`${root}${RULE_PREFIX}/`) || pathname === `${root}${CSRF_PATH}`;

  /** The policies a page goes out with, its own and those of its `103`. */
  const pageHeaders = (headers: Headers, nonce: string, hints: readonly string[]): Headers => {
    // fudic's win over what `load` wrote (SDD-69 §4.2), and in dev its CSP is none.
    if (app.csp === undefined) headers.delete('content-security-policy');
    else headers.set('content-security-policy', cspFor(app.csp, nonce));
    headers.set('referrer-policy', PAGE_REFERRER_POLICY);
    // The `Link` of what is painted, whatever the `103` said (SDD-73 §3.2).
    if (hints.length > 0) headers.set('link', hints.join(', '));
    return headers;
  };

  const hint = (hooks: FetchHooks | undefined, links: readonly string[], nonce: string): void => {
    if (links.length === 0 || hooks?.earlyHints === undefined) return;
    hooks.earlyHints({
      link: links,
      'referrer-policy': PAGE_REFERRER_POLICY,
      ...(app.csp !== undefined ? { 'content-security-policy': cspFor(app.csp, nonce) } : {}),
    });
  };

  /** `html`, through dev's transform when there is one. */
  const transformed = (url: string, html: string, whole: boolean): Promise<string> =>
    options.transformHtml === undefined ? Promise.resolve(html) : options.transformHtml(url, html, whole);

  /**
   * `_error.fud` of `locale` with `problem`, as a whole page. `written` is what `load` wrote
   * before it threw: it goes too (SDD-69 §4.2). `announce`: the page was not hinted yet.
   */
  const errorPage = async (
    url: string,
    problem: PageProblem,
    origin: PageOrigin,
    locale: string | undefined,
    hooks: FetchHooks | undefined,
    written: Headers = new Headers(),
    announce = true,
  ): Promise<Response> => {
    const page = await app.errorPage(locale);
    const nonce = newNonce();
    const hints = page?.hints ?? [];
    if (announce) hint(hooks, hints, nonce);
    const html = await transformed(url, await renderErrorPage(page?.module ?? null, problem, nonce, origin), true);
    const headers = pageHeaders(written, nonce, hints);
    headers.set('content-type', HTML_TYPE);
    return new Response(html, { status: problem.status, headers });
  };

  /** A route's data endpoint (§4.5): what `load` wrote, then its frames as they come. */
  const data = async (route: AppRoute, routePath: string, request: Request): Promise<Response> => {
    const pending = pendingResponse(settings);
    try {
      const frames = await pageData(await app.module(route.pattern), route.pattern, routePath, request, pending);
      // A route that resolves nothing has no endpoint.
      if (frames === null) return new Response(null, { status: 404 });
      const headers = new Headers(pending.headers);
      headers.set('content-type', FRAMES_TYPE);
      return new Response(frames, { status: pending.status, headers });
    } catch (error) {
      // The Service Worker leaves the navigation to the network on any error, and the network
      // answers it with the page (SDD-56 §4.8).
      const failure = classifyError(error, dev);
      if (failure.kind === 'error' && failure.unexpected) options.onError?.(error);
      const problem =
        failure.kind === 'redirect' ? { status: failure.status, title: 'Redirect', location: failure.location } : failure.problem;
      const headers = new Headers(pending.headers);
      headers.set('content-type', 'application/problem+json');
      return new Response(JSON.stringify(problem), { status: problem.status, headers });
    }
  };

  /** A route's page: prerendered, or rendered as it comes; a failure of `load`, its error page. */
  /** A route's prerendered HTML with this response's nonce, or `null` when it has none. */
  const prerenderedPage = async (route: AppRoute, pathname: string, hooks: FetchHooks | undefined): Promise<Response | null> => {
    const prerendered = await app.prerendered(pathname);
    if (prerendered === null) return null;
    const nonce = newNonce();
    const hints = await route.hints();
    hint(hooks, hints, nonce);
    const headers = pageHeaders(new Headers({ 'content-type': HTML_TYPE }), nonce, hints);
    return new Response(applyNonce(prerendered, nonce), { status: 200, headers });
  };

  const page = async (route: AppRoute, pathname: string, url: string, request: Request, hooks: FetchHooks | undefined): Promise<Response | null> => {
    const served = await prerenderedPage(route, pathname, hooks);
    if (served !== null) return served;
    // No prerendered file and nothing to render it with: this route produced nothing to serve.
    if (!route.renders) return null;
    const nonce = newNonce();
    // A page dev refuses is not served at all: `fetch` rejects, and the host shows why.
    await options.prepare?.(route);
    const pending = pendingResponse(settings);
    let hints: readonly string[] = [];
    let failure: PageError;
    try {
      // The `103` before `load` runs (SDD-73 §4.1): that is its whole point.
      hints = await route.hints();
      hint(hooks, hints, nonce);
      const opened = await renderPage(await app.module(route.pattern), route.pattern, pathname, nonce, request, pending, options.onError);
      const headers = pageHeaders(new Headers(pending.headers), nonce, hints);
      headers.set('content-type', HTML_TYPE);
      if (opened.whole) return new Response(await transformed(url, opened.head, true), { status: pending.status, headers });
      // What decides the status has run once the head is in; the rest goes out as it is rendered.
      const head = await transformed(url, opened.head, false);
      return new Response(pageBody(head, opened, options.onError), { status: pending.status, headers });
    } catch (error) {
      failure = classifyError(error, dev);
      if (failure.kind === 'error' && failure.unexpected) options.onError?.(error);
    }
    // What `load` or `layout` threw (SDD-56 §4.8), with what it wrote before (SDD-69 §4.2).
    if (failure.kind === 'redirect') {
      const headers = new Headers(pending.headers);
      headers.set('location', failure.location);
      return new Response(null, { status: failure.status, headers });
    }
    const origin = pageOriginOf(request, app.base, false);
    return errorPage(url, failure.problem, origin, localeOfPath(pathname, locales), hooks, new Headers(pending.headers), false);
  };

  const refererPath = (request: Request): string | undefined => {
    const referer = request.headers.get('referer');
    return referer !== null && URL.canParse(referer) ? pathOf(new URL(referer)) : undefined;
  };

  const fetch = async (incoming: Request, hooks?: FetchHooks): Promise<Response | null> => {
    const request = options.trustProxy === true ? publicRequest(incoming) : incoming;
    const url = new URL(request.url);
    if (isFunctionPath(url.pathname)) return functions === undefined ? noFunction() : functions(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return null;

    const pathname = pathOf(url);
    const asked = `${pathname}${url.search}`;
    const routes = app.routes();

    const redirect = localeRedirect(pathname, request.headers.get('accept-language') ?? undefined, locales, (path) => matchRoute(routes, path) !== null);
    if (redirect !== false) {
      // It varies by `Accept-Language`, and a cache has to know.
      return new Response(null, { status: 302, headers: { location: underBase(app.base, redirect), vary: 'Accept-Language' } });
    }

    if (pathname.startsWith(DATA_PREFIX)) {
      const routePath = pathname.slice(DATA_PREFIX.length) || '/';
      const route = matchRoute(routes, routePath);
      return route === null || !route.renders ? null : data(route, routePath, request);
    }

    // `_error.fud`'s own URL, where `errorPages` sends a call that failed (SDD-56 §4.8), in the
    // locale it is asked in (SDD-58 §4.5).
    const errorPath = withoutLocalePrefix(pathname, locales);
    if (errorPath.startsWith(`${ERROR_PREFIX}/`)) {
      const status = Number(errorPath.slice(ERROR_PREFIX.length + 1));
      if (!Number.isInteger(status) || status < 400 || status > 599) return null;
      const locale = errorLocaleOf(pathname, refererPath(request), locales);
      return errorPage(asked, problemOfStatus(status), pageOriginOf(request, app.base, true), locale, hooks);
    }

    const route = matchRoute(routes, pathname);
    return route === null ? null : page(route, pathname, asked, request, hooks);
  };

  const notFound = async (incoming: Request, hooks?: FetchHooks): Promise<Response | null> => {
    const request = options.trustProxy === true ? publicRequest(incoming) : incoming;
    if (request.method !== 'GET' && request.method !== 'HEAD') return null;
    if (!(request.headers.get('accept') ?? '').includes('text/html')) return null;
    const url = new URL(request.url);
    const pathname = pathOf(url);
    const origin = pageOriginOf(request, app.base, false);
    return errorPage(`${pathname}${url.search}`, problemOfStatus(404), origin, localeOfPath(pathname, locales), hooks);
  };

  const staticHeaders = (request: Request): Readonly<Record<string, string>> | null =>
    app.statics?.[pathOf(new URL(request.url))] ?? null;

  return { fetch, notFound, staticHeaders };
}
