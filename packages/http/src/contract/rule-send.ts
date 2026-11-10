/**
 * The door a remote rule asks through, in the browser (SDD-80 §3.3, §8.2.28): the client halves
 * of its chain — `$global` and its own level — around the `fetch` of the question.
 *
 * The question is a call like a function's, so it carries what a function's call carries: the
 * header of `csrf`, a log line, whatever client step the app wrote. Without them the server's
 * half of the same middleware refuses it (a 403 for `csrf`) before the check runs.
 *
 * What comes back is the `Response` as it came, never an `HttpError`: the validator reads its
 * status and passes anything but a 200 (§4.3). That is also why a step such as `error-pages`
 * never acts on a question — there is no rejection for it to catch — and a courtesy while typing
 * never takes the page away.
 */

import { settled } from '@fudic/forms/contract';
import { run } from '../compose.js';
import type { ClientContext } from '../types.js';
import { compose, type Level } from './middleware.js';

/** How the validator sends one question: the URL and the request it builds. */
export type RuleSend = (url: URL, init: RequestInit & { readonly headers: Headers; readonly signal: AbortSignal }) => Promise<Response>;

/**
 * The sender of the rule `name`, walking the client halves of `chain`. `chain` is read at the
 * first question, not here: a build may evaluate the module of the rules before the one of
 * `$global`, whose binding is then still empty.
 */
export function ruleSend(name: string, chain: () => readonly Level[]): RuleSend {
  return async (url, init) => {
    // The client halves are registered by the browser root, which loads them with dynamic
    // imports: a question asked before that would find them empty.
    await settled();
    const { steps } = compose(chain(), 'client');
    const ctx: ClientContext = { side: 'client', method: 'POST', name, url, headers: new Headers(init.headers), args: undefined, signal: init.signal, catches: [] };
    return (await run(steps as never, ctx, (c: ClientContext) =>
      fetch(c.url, { ...init, headers: c.headers, signal: c.signal }),
    )) as Response;
  };
}
