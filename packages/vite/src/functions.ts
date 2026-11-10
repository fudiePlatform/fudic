/**
 * Server functions in the plugin (SDD-56 §4.15, SDD-81 §3.10): the dev server and `vite preview`
 * serve them through `@fudic/server`, and the build bundles them into `.fudic/edge/functions.mjs`.
 *
 * Where a request goes is the `handler` of the generated server root (SDD-60 §4.4), in all
 * three: this module only writes the module the build bundles, and says which URLs are theirs.
 */

import { CSRF_PATH, FN_PREFIX, RULE_PREFIX } from '@fudic/conventions';
import type { FunctionsOptions, Handler } from '@fudic/server';

/**
 * Whether `pathname` is a server function's URL, the question to a `runs remote` rule (SDD-80
 * §4.4) or the CSRF token's (SDD-81 §3.13), `base` included: the server root's handler answers
 * all three.
 */
export function isFnPath(pathname: string, base: string): boolean {
  const root = base.replace(/\/$/u, '');
  return pathname === `${root}${CSRF_PATH}` || [FN_PREFIX, RULE_PREFIX].some((prefix) => pathname.startsWith(`${root}${prefix}/`));
}

/** The server root's `handler` (SDD-60 §4.4), as the plugin calls it out of the dev graph. */
export type ContractsHandler = (options: FunctionsOptions) => Handler;

/**
 * The `.fudic/edge/functions.mjs` module: every function of the `.fudapi` of the app behind one
 * handler, the server root's (SDD-60 §4.4), and the root's factory itself, which
 * `server.mjs` hands to `createServer` with the server's options (SDD-81 §3.10).
 */
export function emitFunctionsModule(input: {
  /** The id of the server root, whose `handler` answers them. */
  readonly api: string;
  readonly base: string;
  /** Each function's URL and method, for the table an adapter mounts. */
  readonly table: readonly { readonly url: string; readonly method: string }[];
}): string {
  return [
    `import { handler as $api } from ${JSON.stringify(input.api)};`,
    '/** The server root\'s handler factory: what `createServer` of `@fudic/server` is given. */',
    'export const handler = $api;',
    '/** Every server function of the app: a `Request` in, a `Response` out, `null` when not ours. */',
    `export const handle = $api({ base: ${JSON.stringify(input.base)} });`,
    '/** Each function by URL pattern and method, for an adapter to mount. */',
    `export const functions = ${JSON.stringify(input.table)}.map((entry) => ({ ...entry, handle }));`,
    '',
  ].join('\n');
}

/** What a function URL gets in an app without a `.fudapi`: the 404 its dispatcher would give. */
export function noFunction(): Response {
  return new Response(JSON.stringify({ status: 404, title: 'Not Found', detail: 'no such server function' }), {
    status: 404,
    headers: { 'content-type': 'application/problem+json' },
  });
}
