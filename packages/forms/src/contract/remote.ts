/**
 * The browser half of a `runs remote` rule (SDD-80 §4.3): the validator of one use — one field,
 * one rule — that asks the server while the user types.
 *
 * It keeps a timer, an `AbortController` and a cache of `value → errors`. A value it has heard
 * about answers at once, with no network; any other waits `debounce` ms after the last call and
 * then asks, `POST /_fudic/rule/<id>/<name>`, in the rule's format. A new call restarts the wait
 * and aborts the question in flight, and the epoch of the control drops what arrives late.
 *
 * **The question is a courtesy, not the authority.** Anything but a 200 — the network down, a
 * 401, a 429, a 500 — passes as valid, is not kept and paints nothing: the submit runs the rule
 * again on the server. And a submit does not ask (`isWholePass`): it answers from the cache, or
 * passes, and aborts what is in flight.
 *
 * Only the browser module of a remote rule imports it (as `ask`), so no other page bundles it.
 */

import { RULE_PREFIX } from '@fudic/conventions';
import type { Errors } from '../types.js';
import { isWholePass } from '../whole-pass.js';

/** What the question needs of a rule's format: `binWire` or `jsonWire` of `@fudic/http`. */
interface QuestionWire {
  readonly name: 'fud-bin' | 'json';
  readonly type: string;
  encodeArgs(types: Readonly<Record<string, unknown>>, args: Readonly<Record<string, unknown>>): Uint8Array | string | undefined;
  decodeValue(ty: unknown, body: Uint8Array): unknown;
}

/** What `rule()` hands the question of one use. */
export interface Question {
  readonly id: string;
  readonly name: string;
  /** Milliseconds between the last call and the question. */
  readonly debounce: number;
  /** The types of the value and of the parameters, as the server conforms them. */
  readonly value: unknown;
  readonly params: unknown;
  readonly wire: unknown;
  readonly sig?: string;
  /** The arguments of this use. */
  readonly args: unknown;
  /** The errors of a verdict: `null` passes, a code fails with it. */
  readonly answer: (code: string | null) => Errors | null;
  /**
   * How the question is sent: the client halves of the rule's chain around `fetch`
   * (`ruleSend` of `@fudic/http/contract`), so it carries the `csrf` header a function's call
   * carries. A bare `fetch` when the module gives none.
   */
  readonly send?: (url: URL, init: RequestInit & { readonly headers: Headers; readonly signal: AbortSignal }) => Promise<Response>;
}

/** The validator of one use, as a control calls it: the value, its root, and the mark of the pass. */
export type Asking = (value: unknown, root?: unknown, pass?: unknown) => Errors | null | Promise<Errors | null>;

/** The header that carries the signature of a question in `fud-bin` (SDD-67 §3.3). */
const SIG_HEADER = 'fud-sig';

/** The verdict in `fud-bin`: the code that failed, or `null`. */
const VERDICT = { opt: 'str' };

/** What is waiting to be asked or is in flight: one per use at most. */
interface Waiting {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly controller: AbortController;
  readonly resolve: (found: Errors | null) => void;
}

/** The validator that asks the server about the value of one use. */
export function askRemote(q: Question): Asking {
  const wire = q.wire as QuestionWire;
  const types = { value: q.value, params: { fields: () => q.params } };
  const path = `${RULE_PREFIX}/${q.id}/${q.name}`;
  const cache = new Map<string, Errors | null>();
  const send = q.send ?? ((url: URL, init: RequestInit) => fetch(url, init));
  let waiting: Waiting | undefined;

  /** Stops the wait and the question in flight: what they were asked passes. */
  const cancel = (): void => {
    if (waiting === undefined) return;
    clearTimeout(waiting.timer);
    waiting.controller.abort();
    waiting.resolve(null);
    waiting = undefined;
  };

  /** The errors the server answered, or `undefined` for anything but a 200 with a verdict. */
  const ask = async (value: unknown, signal: AbortSignal): Promise<Errors | null | undefined> => {
    try {
      const headers = new Headers({ 'content-type': wire.type });
      if (q.sig !== undefined) headers.set(SIG_HEADER, q.sig);
      const body = wire.encodeArgs(types, { value, params: q.args }) as BodyInit;
      const url = new URL(path, globalThis.location.origin);
      const response = await send(url, { method: 'POST', headers, body, signal, credentials: 'same-origin' });
      if (response.status !== 200) return undefined;
      const bytes = new Uint8Array(await response.arrayBuffer());
      // `str?` reads a `null` back absent.
      if (wire.name === 'fud-bin') return q.answer((wire.decodeValue(VERDICT, bytes) as string | undefined) ?? null);
      const verdict = wire.decodeValue('any', bytes) as { readonly ok: boolean; readonly fails?: string };
      return q.answer(verdict.ok ? null : verdict.fails!);
    } catch {
      // Aborted, the network down, a body that is not a verdict: the submit decides.
      return undefined;
    }
  };

  return (value, _root, pass) => {
    cancel();
    // The parameters are this use's, fixed: the value alone tells two questions apart.
    const key = JSON.stringify(value);
    if (cache.has(key)) return cache.get(key)!;
    if (isWholePass(pass)) return null;
    return new Promise((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        void ask(value, controller.signal).then((found) => {
          if (found !== undefined) cache.set(key, found);
          if (waiting?.controller === controller) waiting = undefined;
          resolve(found ?? null);
        });
      }, q.debounce);
      waiting = { timer, controller, resolve };
    });
  };
}
