/**
 * The upload pipeline (SDD-56 §4.17): successive transformations of the body, after the
 * client chain and before the network. A stage that cannot apply is skipped and the payload
 * goes on untouched: no stage fails a request or changes what `handle` receives, it only
 * changes how many bytes travel.
 */

import type { Schema } from '@fudic/forms';
import type { CompressOptions, Method } from '../types.js';

/** What crosses the pipeline: each stage takes one and returns another. */
export interface Payload {
  /** The form, then the array, then the string or the bytes. */
  readonly value: unknown;
  readonly headers: Readonly<Record<string, string>>;
  /** The schema of the form, once `positional` has taken its keys away. */
  readonly schema?: Schema;
}

export interface CallInfo {
  readonly method: Method;
  readonly compress: CompressOptions | false;
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
