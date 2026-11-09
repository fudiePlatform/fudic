/**
 * The question of a `runs remote` rule (SDD-80 §3.3, §4.4): `POST /_fudic/rule/<id>/<name>`,
 * what the browser asks while the user types. Only the server imports it.
 *
 * It answers like a function: the signature first (412), then the shape of the value and of the
 * parameters (400), then the chain — `$global` and the rule's own middlewares — around its check.
 * The verdict travels in the rule's format: in `fud-bin` the code that failed or `null`, with
 * `use json` an object `{ ok, fails? }`. An error is a problem in that same format.
 */

import { createRoot } from '@fudic/di';
import { remoteRule, runRulesWith, type RemoteRule } from '@fudic/forms/contract';
import { run } from '../compose.js';
import { HttpError, notFound } from '../errors.js';
import { bodyArgs } from '../server/body.js';
import { markPrivate, serverContext } from '../server/context.js';
import { settingsOf, type DispatchOptions } from '../server/dispatch.js';
import { noFunction, problemOf, problemResponse } from '../server/problem.js';
import { withRequest } from '../server/request.js';
import type { ServerContext } from '../types.js';
import type { Wire } from '../wire/wire.js';
import { SIG_HEADER } from './fn.js';
import { compose, type Level } from './middleware.js';
import { conform, conformAll, type Ty } from './wire.js';

let installed = false;

/**
 * Hands `@fudic/forms` the runner of the levels around a rule's check (SDD-80 §3.2), once. The
 * server calls it before it validates anything a rule the server runs could be in: a submit
 * (`withForm`) and a question.
 */
export function ruleChains(): void {
  if (installed) return;
  runRulesWith((levels, ctx, inner) => run(compose(levels as readonly Level[], 'server').steps, ctx, inner));
  installed = true;
}

/** What a remote rule asks with: the type of its value and of the parameters of a use — always both. */
interface Asked {
  readonly value: Ty;
  readonly params: Readonly<Record<string, Ty>>;
}

/** The types of a question: the value the rule watches and the parameters of the use. */
const questionTypes = ({ value, params }: Asked): Readonly<Record<string, Ty>> => ({ value, params: { fields: () => params } });

/** The verdict in `fud-bin`: `str?`, the code that failed or `null` (SDD-80 §3.3). */
const VERDICT: Ty = { opt: 'str' };

function verdictResponse(code: string | null, ctx: ServerContext, wire: Wire): Response {
  markPrivate(ctx.response);
  const { headers } = ctx.response;
  headers.set('content-type', wire.type);
  // JSON writes `{ ok, fails? }` as it is: its encoder reads no type.
  const body =
    wire.name === 'fud-bin'
      ? wire.encodeValue(VERDICT, code)
      : wire.encodeValue('any', code === null ? { ok: true } : { ok: false, fails: code });
  return new Response(body as BodyInit, { status: 200, headers });
}

/** 412: the page was built against another version of the rule (SDD-67 §3.3). */
const stale = (): HttpError =>
  new HttpError({ status: 412, title: 'Precondition Failed', detail: 'the page is older than the server' });

/** Answers one question to `rule`. */
export async function serveRule(request: Request, rule: RemoteRule, options: DispatchOptions = {}): Promise<Response> {
  const { spec } = rule;
  const wire = spec.wire as Wire;
  // The generated module writes both for every remote rule (SDD-80 §8.2.1).
  const asked = spec as unknown as Asked;
  let response: ServerContext['response'] | undefined;
  try {
    if (request.method !== 'POST') throw new HttpError({ status: 405, title: 'Method Not Allowed' });
    if (!rule.implemented()) throw notFound(options.dev === true ? rule.missing() : undefined);
    if (request.headers.get(SIG_HEADER) !== (spec.sig ?? null)) throw stale();
    const raw = await bodyArgs(request, wire, questionTypes(asked));
    const value = conform(asked.value, raw['value'], 'value');
    const params = conformAll(asked.params, raw['params'], 'parameter');
    const ctx = serverContext({ method: 'POST', name: spec.name, url: new URL(request.url), params: {}, args: { value, params }, request, settings: settingsOf(options) });
    response = ctx.response;
    ruleChains();
    const code = await withRequest((options.container ?? createRoot)(), () => rule.ask(value, params, ctx));
    return verdictResponse(code, ctx, wire);
  } catch (e) {
    if (!(e instanceof HttpError)) options.onError?.(e);
    return problemResponse(problemOf(e, options.dev === true), wire, response);
  }
}

/**
 * The questions under `prefix` (`<base>/_fudic/rule/`): a `Response`, or `null` for a URL outside
 * it. One that names no remote rule — one that does not exist, or a `runs server` rule, which
 * has no route — is a 404, as a function that does not exist.
 */
export function rulesHandler(prefix: string, options: DispatchOptions): (request: Request) => Promise<Response | null> {
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(prefix)) return null;
    const parts = pathname.slice(prefix.length).split('/');
    const name = parts.pop()!;
    const rule = remoteRule(parts.join('/'), name);
    if (rule === undefined) return noFunction(request, 'no such remote rule');
    return serveRule(request, rule, options);
  };
}
