/**
 * A test `ServerApp`: routes, render modules and pages made of plain values, so each test says
 * what the app holds and asks the server what it answers.
 */

import type { RenderContext } from '@fudic/transport';
import type { AppRoute, ErrorPage, FunctionsOptions, Handler, RenderModule, ServerApp } from '../src/index.js';

const utf8 = new TextEncoder();

/** A stream of `parts`, each one chunk. */
export function streamOf(...parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(utf8.encode(part));
      controller.close();
    },
  });
}

/** A stream that fails before its first byte: `load` threw. */
export function failing(error: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(error);
    },
  });
}

/** What an `HttpError` of the app's own copy of `@fudic/http` looks like to the server. */
export const httpError = (status: number, title = 'T', detail?: string): { status: number; problem: object } => ({
  status,
  problem: { status, title, ...(detail !== undefined ? { detail } : {}) },
});

/** A `Redirect`, by shape. */
export const redirect = (location: string, status = 303): object => ({ ...httpError(status, 'See Other'), location });

/** A page whose render writes what `load` would, then the page with its URL and nonce. */
export function pageModule(write: (ctx: RenderContext) => void = () => undefined): RenderModule {
  return {
    render: (ctx) => {
      write(ctx);
      return streamOf(`<html><head><title>${ctx.url.pathname}</title></head>`, `<body nonce="${ctx.nonce}">${ctx.url.href}</body></html>`);
    },
  };
}

export interface RouteSpec {
  readonly pattern: string;
  readonly module?: RenderModule;
  readonly hints?: readonly string[];
  readonly prerendered?: string;
}

export interface AppSpec {
  readonly base?: string;
  readonly locales?: readonly string[];
  readonly csp?: string;
  readonly statics?: ServerApp['statics'];
  readonly routes?: readonly RouteSpec[];
  readonly errorPages?: Readonly<Record<string, ErrorPage>>;
  readonly functions?: (options: FunctionsOptions) => Handler;
}

/** The app `spec` describes. A route without a module does not render; one with `prerendered` has a page. */
export function testApp(spec: AppSpec = {}): ServerApp {
  const routes = spec.routes ?? [];
  const table: AppRoute[] = routes.map((r) => ({
    pattern: r.pattern,
    renders: r.module !== undefined,
    hints: async () => r.hints ?? [],
  }));
  return {
    base: spec.base ?? '/',
    locales: spec.locales ?? [],
    ...(spec.csp !== undefined ? { csp: spec.csp } : {}),
    ...(spec.statics !== undefined ? { statics: spec.statics } : {}),
    routes: () => table,
    module: async (pattern) => routes.find((r) => r.pattern === pattern)!.module!,
    errorPage: async (locale) => spec.errorPages?.[locale ?? ''] ?? null,
    prerendered: async (pathname) => routes.find((r) => r.prerendered !== undefined && r.pattern === pathname)?.prerendered ?? null,
    ...(spec.functions !== undefined ? { functions: spec.functions } : {}),
  };
}

/** An `_error.fud` that paints its data as JSON, so a test reads what it was given. */
export function errorModule(hints: readonly string[] = []): ErrorPage {
  return {
    module: { render: (ctx) => streamOf(`<html><head></head><body nonce="${ctx.nonce}">${JSON.stringify(ctx.data)}</body></html>`) },
    hints,
  };
}

/** A navigation to `url`. */
export const navigate = (url: string, headers: Record<string, string> = {}): Request =>
  new Request(new URL(url, 'http://app.test'), { headers: { accept: 'text/html', ...headers } });
