/**
 * `chain()`: the global level (`src/http.ts`) and a file's level (`export const http`) of a
 * chain (SDD-56 §3.3). Immutable: every call returns a new builder.
 */

import { skipStep, withStep, type Level } from './step.js';
import type { AnyMiddleware, CompressOptions } from './types.js';

export interface ChainBuilder {
  use(...mws: readonly AnyMiddleware[]): ChainBuilder;
  skip(...mws: readonly AnyMiddleware[]): ChainBuilder;
  skip(all: '*'): ChainBuilder;
  compress(options: CompressOptions | false): ChainBuilder;
}

class Chain implements ChainBuilder {
  constructor(readonly level: Level) {}

  use(...mws: readonly AnyMiddleware[]): ChainBuilder {
    return new Chain(withStep(this.level, { kind: 'use', mws }));
  }

  skip(...mws: readonly (AnyMiddleware | '*')[]): ChainBuilder {
    return new Chain(withStep(this.level, skipStep(mws)));
  }

  compress(options: CompressOptions | false): ChainBuilder {
    return new Chain({ ...this.level, compression: options });
  }
}

export function chain(): ChainBuilder {
  return new Chain({ steps: [] });
}

/** The level a chain wrote. */
export function levelOfChain(c: ChainBuilder): Level {
  return (c as Chain).level;
}
