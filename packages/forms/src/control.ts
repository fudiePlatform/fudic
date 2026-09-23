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
import { attach, type NodeInternals, type ValidateCtx } from './internals.js';
import { messageOf } from './messages.js';
import { firstFailure, isPending } from './run-rule.js';
import { isServerOnly } from './server-flag.js';
import type {
  AnyForm,
  AnyValidator,
  Control,
  ControlOptions,
  Errors,
  Readable,
  Widen,
} from './types.js';

/** The writable shape used while building; the public type is `Control<T>`. */
interface Mutable<T> {
  (): T;
  set(v: T): void;
  errors: Readable<Errors | null>;
  touched: Readable<boolean>;
  dirty: Readable<boolean>;
  touch(): void;
  reset(v?: T): void;
  validate(opts?: { readonly server?: boolean }): Promise<boolean>;
  message: Readable<string>;
}

/**
 * `NoInfer` on the rules so the value decides the type and the rules do not: a
 * `Validator<string>` in the list must not be what makes the control a string.
 *
 * The list is `AnyValidator`, which is what lets a rule declare the root it looks
 * at — `(v: string, root: Post) => …` — and land here with no cast at all.
 */
export function control<T>(
  initial?: T,
  validators: readonly AnyValidator<NoInfer<Widen<T>>>[] = [],
  options: ControlOptions = {},
): Control<Widen<T>> {
  // Omitted and explicitly `undefined` are the same case, and both mean `null`:
  // a control never holds `undefined`.
  return build<Widen<T>>(
    (initial === undefined ? null : initial) as Widen<T>,
    validators as readonly AnyValidator<Widen<T>>[],
    options,
  );
}

function build<T>(
  initial: T,
  validators: readonly AnyValidator<T>[],
  options: ControlOptions,
): Control<T> {
  const value = signal<T>(initial);
  const errors = signal<Errors | null>(null);
  const touched = signal(false);
  const dirty = signal(false);

  /**
   * What `dirty` compares against. It starts at the DECLARED value and moves when
   * the form is loaded, because loading is not editing: an edit page fills its
   * fields from the server and the user has not touched anything yet.
   *
   * `reset()` goes back to the DECLARED value, not to the loaded one — cancelling
   * takes the form back to how it was defined.
   */
  let baseline = initial;
  /** Bumped whenever the value moves. A validation older than the current one is dropped. */
  let epoch = 0;
  /** The outermost form this control lives in. `null` for a control that is still a template. */
  let root: AnyForm | null = null;

  const write = (v: T): void => {
    const next = (v === undefined ? null : v) as T;
    if (Object.is(next, untrack(value))) {
      return;
    }
    epoch += 1;
    value.set(next);
    dirty.set(!Object.is(next, baseline));
  };

  /** Puts the control at a value and makes that value the new reference. */
  const rebase = (to: T): void => {
    baseline = to;
    epoch += 1;
    value.set(to);
    errors.set(null);
    touched.set(false);
    dirty.set(false);
  };

  const reset = (v?: T): void => {
    rebase(v === undefined ? initial : v);
  };

  /**
   * Runs the rules and publishes, synchronously when every rule answers now. Only an
   * asynchronous answer can find the value moved on, so that is the only place the epoch
   * has anything to say.
   */
  const validateSubtree = (ctx: ValidateCtx): Promise<void> | undefined => {
    const mine = epoch;
    const rules = ctx.server ? validators : validators.filter((rule) => !isServerOnly(rule));
    const found = firstFailure(rules, untrack(value), ctx.root);
    if (!isPending(found)) {
      errors.set(found);
      return undefined;
    }
    return found.then((late) => {
      if (mine === epoch) errors.set(late);
    });
  };

  const internals: NodeInternals = {
    kind: 'control',
    clone: () => build(initial, validators, options),
    read: () => value(),
    // `$set` is a LOAD: the value comes from the other end, so it becomes the new
    // reference and the field is neither dirty nor touched.
    set: (v) => {
      rebase((v === undefined ? null : v) as T);
    },
    patch: (v) => {
      write(v as T);
    },
    // A control accepts any value: there is nothing to check before writing.
    check: () => {},
    validateSubtree,
    adopt: (r) => {
      root = r;
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
  self.validate = async (opts = {}) => {
    if (root === null) {
      throw new TypeError('control.validate: this control belongs to no form, so it has no root');
    }
    await validateSubtree({ root, server: opts.server === true });
    return untrack(errors) === null;
  };
  self.message = () => {
    const e = errors();
    return e === null ? '' : messageOf(e, options.messages);
  };

  return attach(self, internals);
}
