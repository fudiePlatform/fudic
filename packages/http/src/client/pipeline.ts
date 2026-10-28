/**
 * The upload pipeline (SDD-56 §4.17, SDD-67 §3.6): successive transformations of the body,
 * after the client chain and before the network. `encode` writes it in the function's format;
 * `compress` may shrink it. A stage that cannot apply is skipped and the payload goes on
 * untouched: no stage fails a request or changes what `handle` receives.
 */

import type { CompressOptions, Method } from '../types.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';

/** What crosses the pipeline: each stage takes one and returns another. */
export interface Payload {
  /** The arguments or the form, then the string or the bytes. */
  readonly value: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

export interface CallInfo {
  readonly method: Method;
  readonly compress: CompressOptions | false;
  /** The function's format. */
  readonly wire: Wire;
  /** The types of its body: its body arguments, or its form's controls. */
  readonly types: Readonly<Record<string, Ty>>;
}

export interface Stage {
  readonly name: string;
  /** Runtime capability, evaluated once per process. `false`: the stage does not exist here. */
  supported(): boolean;
  /** Policy, with the concrete payload in front. No side effects. */
  applies(p: Payload, call: CallInfo): boolean;
  /** Only called when `supported() && applies(…)`. Returning `p` untouched is legitimate. */
  apply(p: Payload, call: CallInfo): Payload | Promise<Payload>;
}

const support = new Map<Stage, boolean>();

const supported = (stage: Stage): boolean => {
  let known = support.get(stage);
  if (known === undefined) {
    known = stage.supported();
    support.set(stage, known);
  }
  return known;
};

export async function runPipeline(
  stages: readonly Stage[],
  payload: Payload,
  call: CallInfo,
): Promise<Payload> {
  let p = payload;
  for (const stage of stages) {
    if (supported(stage) && stage.applies(p, call)) p = await stage.apply(p, call);
  }
  return p;
}

/** Bytes, as opposed to a value still to encode. */
export const isBytes = (v: unknown): v is Uint8Array => v instanceof Uint8Array;
