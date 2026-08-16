/**
 * `control` — a leaf: a signal with the interaction state around it.
 *
 * Four signals and no more machinery: value, errors, touched and dirty. `dirty` is
 * not a `computed` because its other source — the baseline — is not reactive, so
 * comparing inside the write costs the same and creates no derived node.
 *
 * The write is the ONLY place where `undefined` is normalised, and it is shallow on
 * purpose: `null` as the canonical empty is a decision about the model, while the
 * deep normalisation the prototype does exists because `JSON.stringify` drops
 * `undefined` keys — a serialisation problem, paid by everyone for the case of
 * nobody as long as the value has not crossed a wire.
 *
 * Every control carries an EPOCH, and it is what makes asynchronous validation
 * safe: a result is published only if the value has not moved since the run
 * started. Without it, two overlapping validations resolve in whatever order the
 * network returns and the user reads the error of what they typed three letters
 * ago.
 */

import { signal, untrack } from '@fudic/core';
import { attach, type NodeInternals } from './internals.js';
import { isServerOnly } from './server-flag.js';
import type { Control, Errors, Readable, Validator, Widen } from './types.js';

/** The writable shape used while building; the public type is `Control<T>`. */
interface Mutable<T> {
  (): T;
  set(v: T): void;
  errors: Readable<Errors | null>;
  touched: Readable<boolean>;
  dirty: Readable<boolean>;
  touch(): void;
  reset(v?: T): void;
}

/**
 * `NoInfer` on the rules so the value decides the type and the rules do not: a
 * `Validator<string>` in the list must not be what makes the control a string.
 */
export function control<T>(
  initial?: T,
  validators: readonly Validator<NoInfer<Widen<T>>>[] = [],
): Control<Widen<T>> {
  // Omitted and explicitly `undefined` are the same case, and both mean `null`:
  // a control never holds `undefined`.
  return build<Widen<T>>(
    (initial === undefined ? null : initial) as Widen<T>,
    validators as readonly Validator<Widen<T>>[],
  );
}

function build<T>(initial: T, validators: readonly Validator<T>[]): Control<T> {
  const value = signal<T>(initial);
  const errors = signal<Errors | null>(null);
  const touched = signal(false);
  const dirty = signal(false);

  /** The baseline `dirty` compares against. `reset(v)` moves it. */
  let baseline = initial;
  /** Bumped whenever the value moves. A validation older than the current one is dropped. */
  let epoch = 0;

  const write = (v: T): void => {
    const next = (v === undefined ? null : v) as T;
    if (Object.is(next, untrack(value))) {
      return;
    }
    epoch += 1;
    value.set(next);
    dirty.set(!Object.is(next, baseline));
  };

  const reset = (v?: T): void => {
    if (v !== undefined) {
      baseline = v;
    }
    epoch += 1;
    value.set(baseline);
    errors.set(null);
    touched.set(false);
    dirty.set(false);
  };

  const internals: NodeInternals = {
    kind: 'control',
    clone: () => build(initial, validators),
    read: () => value(),
    set: (v) => {
      write(v as T);
    },
    patch: (v) => {
      write(v as T);
    },
    // A control accepts any value: there is nothing to check before writing.
    check: () => {},
    async validateSubtree(ctx) {
      const mine = epoch;
      let found: Errors | null = null;
      for (const rule of validators) {
        if (isServerOnly(rule) && !ctx.server) {
          continue;
        }
        const result = await rule(untrack(value), ctx.root);
        // One error per field, not a list: the first failure stops the run.
        if (result) {
          found = result;
          break;
        }
      }
      if (mine !== epoch) {
        return;
      }
      errors.set(found);
    },
    publish: (e) => {
      errors.set(e);
      if (e) {
        // An error nobody can see is not an error: whatever arrives from outside
        // has already been "been through" as far as the user is concerned.
        touched.set(true);
      }
    },
    child: () => undefined,
    collect: (path, out) => {
      const e = errors();
      if (e) {
        out[path] = e;
      }
    },
    valid: () => untrack(errors) === null,
    touchAll: () => {
      touched.set(true);
    },
    resetAll: () => {
      reset();
    },
    clearAll: () => {
      errors.set(null);
    },
  };

  // Built as a callable and then given its properties: the cast is the only way
  // to say "this function is about to become a `Control`".
  const self = (() => value()) as Mutable<T>;
  self.set = write;
  self.errors = () => errors();
  self.touched = () => touched();
  self.dirty = () => dirty();
  self.touch = () => {
    touched.set(true);
  };
  self.reset = reset;

  return attach(self, internals);
}
