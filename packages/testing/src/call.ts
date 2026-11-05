/**
 * `callJob`: one function of a `.fudapi` called as the browser calls it (SDD-78 §4.2), inside the
 * project's vitest: the page's own call — its codec, its signature header, its client halves — and
 * the request it makes sent over HTTP to the dev server, which answers it through the chain of
 * middlewares, the form's rules and `fails`/`catches`, as in production. No cookie goes with it.
 *
 * Internal: `@fudic/testing/run` writes the test file that calls it.
 */

import { request as httpRequest } from 'node:http';
import { answerWith } from './fetch.js';

/** What a function of the generated module is: a call with the options of `$fn`. */
type Call = (input?: unknown, options?: { readonly params?: Readonly<Record<string, string>> }) => Promise<unknown>;

export interface CallJob {
  /** The function, from `import * as api from 'fudic:<id>'`. */
  readonly fn: Call;
  readonly args?: unknown;
  readonly params?: Readonly<Record<string, string>>;
  /** The dev server: `http://127.0.0.1:4318`. */
  readonly origin: string;
  /** What the dev server's door asks for, besides the request: not the app's. */
  readonly headers?: Readonly<Record<string, string>>;
}

export type CallOutcome =
  | { readonly kind: 'answered'; readonly status: number; readonly value: unknown }
  | { readonly kind: 'problem'; readonly status: number; readonly problem: unknown }
  | { readonly kind: 'threw'; readonly message: string };

/** The request, to the dev server, as a browser on its page would send it; its response back. */
export function forward(origin: string, headers: Readonly<Record<string, string>>): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, origin);
    const body = Buffer.from(await request.arrayBuffer());
    const sent: Record<string, string> = { ...Object.fromEntries(request.headers), origin, 'sec-fetch-site': 'same-origin', ...headers };
    if (body.length > 0) sent['content-length'] = String(body.length);
    return new Promise((resolve, reject) => {
      const req = httpRequest(target, { method: request.method, headers: sent }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const out = new Headers();
          for (const [name, value] of Object.entries(res.headers)) if (typeof value === 'string') out.set(name, value);
          const status = res.statusCode!;
          // A body with a status that has none is refused by `Response`.
          resolve(new Response(status === 204 || status === 304 ? null : Buffer.concat(chunks), { status, headers: out }));
        });
      });
      req.on('error', reject);
      req.end(body);
    });
  };
}

export async function callJob(job: CallJob): Promise<CallOutcome> {
  let status = 0;
  const send = forward(job.origin, job.headers ?? {});
  answerWith(async (request) => {
    const response = await send(request);
    status = response.status;
    return response;
  });
  try {
    const value = await job.fn(job.args, job.params === undefined ? {} : { params: job.params });
    return { kind: 'answered', status, value: value ?? null };
  } catch (error) {
    // What the server answered with a `Problem` is thrown carrying it: an answer, not a failure.
    const problem = (error as { readonly problem?: unknown }).problem;
    if (problem !== undefined) return { kind: 'problem', status: status === 0 ? Number((problem as { status?: unknown }).status) : status, problem };
    return { kind: 'threw', message: error instanceof Error ? error.message : String(error) };
  } finally {
    answerWith(undefined);
  }
}
