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

import { computed, signal, untrack } from '@fudic/core';
import { attach, type NodeInternals, type ValidateCtx } from './internals.js';
import { messageOf } from './messages.js';
import { firstFailure, holds, isPending } from './run-rule.js';
import { isServerOnly } from './server-flag.js';
import { DEFAULT_VALIDATE_ON, type ValidateOn } from './validate-on.js';
import { verdicts } from './verdicts.js';
import { DEFAULT_VALIDITY, Validity } from './validity.js';
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
  validateOn: () => ValidateOn;
  valid: Readable<boolean>;
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
   * The value has moved since the last load or reset, even if it came back. Unlike dirty it
   * does not go back: whoever types bc and deletes it has interacted with the field, and the
   * validity has to count it exactly when it is wrong (BUG-42 §4.3).
   */
  const edited = signal(false);

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
  /** The policy of the nearest form that chose one, handed down with the root. */
  let inherited: ValidateOn | undefined;
  /** The validity of the nearest form that chose one, handed down the same way. */
  let inheritedValidity: Validity | undefined;
  /** Re-runs the own rules of the forms above. Set with the root: no root, no validation. */
  let above: () => void;
  /**
   * The epoch the errors on record belong to. An error published for a value that has since
   * moved says nothing about the current one — a 422 counts until the field is edited.
   */
  let publishedAt = 0;
  /** Which asynchronous rules have answered for which epoch. */
  const settle = verdicts();
  /** The rules that run on the client. The validity never runs the others. */
  const clientRules = validators.filter((rule) => !isServerOnly(rule));

  /** Publishes the errors of the current value. */
  const record = (e: Errors | null): void => {
    publishedAt = epoch;
    errors.set(e);
  };

  const write = (v: T): void => {
    const next = (v === undefined ? null : v) as T;
    if (Object.is(next, untrack(value))) {
      return;
    }
    epoch += 1;
    value.set(next);
    dirty.set(!Object.is(next, baseline));
    edited.set(true);
  };

  /** Puts the control at a value and makes that value the new reference. */
  const rebase = (to: T): void => {
    baseline = to;
    epoch += 1;
    value.set(to);
    errors.set(null);
    touched.set(false);
    dirty.set(false);
    edited.set(false);
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
    const rules = settle.watch(ctx.server ? validators : clientRules, mine);
    const found = firstFailure(rules, untrack(value), ctx.root);
    if (!isPending(found)) {
      record(found);
      return undefined;
    }
    return found.then((late) => {
      if (mine === epoch) record(late);
    });
  };

  /** The outermost form, which every rule receives as `root`. A template control has none. */
  const rootOf = (who: string): AnyForm => {
    if (root === null) {
      throw new TypeError(`control.${who}: this control belongs to no form, so it has no root`);
    }
    return root;
  };

  /** The user has been through this control, or its policy does not wait for them to. */
  const counts = (): boolean =>
    (options.validity ?? inheritedValidity ?? DEFAULT_VALIDITY) === Validity.Rules ||
    touched() ||
    edited();

  /**
   * The validity (BUG-42 §4.3). The synchronous rules are run LIVE on the current value — with no
   * `untrack`, so a rule that reads another field subscribes it — the asynchronous ones are read
   * from their verdicts, and what is on record for this value (an asynchronous failure, a 422)
   * counts too. Nothing here writes.
   */
  const valid = computed((): boolean => {
    if (!counts()) return true;
    const at = epoch;
    if (!holds(clientRules, value(), rootOf('valid'), (rule) => settle.settled(rule, at))) {
      return false;
    }
    return errors() === null || publishedAt !== at;
  });

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
    adopt: (r, validateOn, validity, up) => {
      root = r;
      inherited = validateOn;
      inheritedValidity = validity;
      above = up;
    },
    publish: (e) => {
      record(e);
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
    clean: () => untrack(errors) === null,
    valid,
    counts,
    epoch: () => epoch,
    issues: (path, out) => {
      if (touched() && errors() !== null) out.push({ path, message: self.message() });
    },
    // A control holds no submit of its own: the form it belongs to does.
    markSubmitted: () => {},
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
    const late = validateSubtree({ root: rootOf('validate'), server: opts.server === true });
    // The summaries above speak at the moments their fields do (BUG-42 §0.6, §4.7).
    above();
    await late;
    return untrack(errors) === null;
  };
  self.message = () => {
    const e = errors();
    return e === null ? '' : messageOf(e, options.messages);
  };
  self.validateOn = () => options.validateOn ?? inherited ?? DEFAULT_VALIDATE_ON;
  self.valid = () => valid();

  return attach(self, internals);
}
