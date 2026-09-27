/**
 * `form` — the `$` API plus the fields by name.
 *
 * A group is built by the same function, and that is the decision that keeps this
 * file small: `f.seo.$value()`, `f.seo.$touch()` and `f.seo.$errors()` exist without
 * a single line written for the nested case, and the recursion has one `if`.
 *
 * The schema is a TEMPLATE: `form()` clones every node, so a schema declared at
 * module scope can be imported by both ends and instantiated per request without
 * two requests sharing a value. `$schema` hands back the template, inert, which is
 * exactly what a transport needs later — order and declared types, with nothing to
 * negotiate.
 *
 * Writing is two operations on purpose. The prototype had one with total meaning,
 * so an object that did not mention a field emptied it: a `PATCH` body carrying
 * three fields of twelve blanked the other nine and sent them back.
 */

import { computed, signal, untrack } from '@fudic/core';
import {
  attach,
  internalsOf,
  join,
  type NodeInternals,
  type ValidateCtx,
  type WriteMode,
} from './internals.js';
import { messagesOf } from './messages.js';
import { allFailures, holds } from './run-rule.js';
import { isServerOnly } from './server-flag.js';
import type {
  AnyForm,
  AnyNode,
  AnyValidator,
  ErrorMap,
  Errors,
  Form,
  FormOptions,
  Issue,
  Patch,
  Schema,
  Value,
} from './types.js';
import { verdicts } from './verdicts.js';
import { DEFAULT_VALIDITY, Validity } from './validity.js';

/** A plain object, which is the only thing a form can be written from. */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function form<S extends Schema>(schema: S, options: FormOptions<S> = {}): Form<S> {
  return build(schema, options, []);
}

/**
 * Shared by `form()` and `group()`. The only difference between the two is where
 * the form-level rule comes from: `options.summary` for a form, the validators of
 * the group for a group. Both land in the same `$summary`.
 */
export function build<S extends Schema>(
  schema: S,
  options: FormOptions<S>,
  validators: readonly AnyValidator<Value<S>>[],
): Form<S> {
  const entries = Object.entries(schema);
  for (const [name] of entries) {
    if (name.startsWith('$')) {
      // Silently dropping it would lose a field; shadowing the API would be worse.
      throw new TypeError(`form: field name "${name}" is reserved, the $ namespace is the API`);
    }
  }

  const fields = entries.map(([name]) => name) as (keyof S & string)[];
  const nodes = new Map<string, AnyNode>(
    entries.map(([name, node]) => [name, internalsOf(node).clone()]),
  );

  const summary = signal<Errors | null>(null);
  /** A submit was attempted (BUG-42 §4.7). Only `bindForm` sets it, through `markSubmitted`. */
  const submitted = signal(false);
  /** Bumped by every validation pass over this form; an overtaken pass publishes nothing. */
  let epoch = 0;
  /** The value epoch (`valueEpoch()`) the summary on record belongs to. */
  let publishedAt = 0;
  /** The outermost form: what its own rules receive as `root` when the validity runs them. */
  let root: AnyForm;
  /** The validity of the nearest form above that chose one. */
  let inheritedValidity: Validity | undefined;
  /** Which asynchronous rules of its own have answered for which value. */
  const settle = verdicts();

  // The two sources of a form-level error are the same thing seen from two ends —
  // a group carries its own rules, a root form carries `summary` — so they are
  // folded into one list here instead of being two branches in the walk.
  const summaryRule = options.summary;
  const rules: readonly AnyValidator<Value<S>>[] = summaryRule
    ? [...validators, () => summaryRule(self)]
    : validators;
  const clientRules = rules.filter((rule) => !isServerOnly(rule));

  const nodeOf = (name: string): AnyNode | undefined => nodes.get(name);
  const each = (fn: (name: string, node: NodeInternals) => void): void => {
    for (const [name, node] of nodes) {
      fn(name, internalsOf(node));
    }
  };
  const children = (): NodeInternals[] => [...nodes.values()].map(internalsOf);

  /** Moves whenever any value below moves: the sum of monotonic epochs. */
  const valueEpoch = (): number => children().reduce((sum, node) => sum + node.epoch(), 0);

  /** Publishes the form-level error of the values of `at`. */
  const record = (e: Errors | null, at: number): void => {
    publishedAt = at;
    summary.set(e);
  };

  const read = (): Value<S> => {
    const out: Record<string, unknown> = {};
    each((name, node) => {
      out[name] = node.read();
    });
    return out as Value<S>;
  };

  const check = (v: unknown, mode: WriteMode, path: string): void => {
    const where = path === '' ? '' : ` at "${path}"`;
    if (!isRecord(v)) {
      throw new TypeError(`$${mode}: expected an object${where}`);
    }
    for (const name of Object.keys(v)) {
      if (!nodes.has(name)) {
        throw new TypeError(`$${mode}: unknown field "${join(path, name)}"`);
      }
    }
    each((name, node) => {
      const has = name in v;
      if (mode === 'set' && !has) {
        throw new TypeError(`$set: missing field "${join(path, name)}"`);
      }
      if (has) {
        node.check(v[name], mode, join(path, name));
      }
    });
  };

  const write = (v: Record<string, unknown>, mode: WriteMode): void => {
    each((name, node) => {
      if (!(name in v)) {
        return;
      }
      if (mode === 'set') {
        node.set(v[name]);
      } else {
        node.patch(v[name]);
      }
    });
    if (mode === 'set') {
      // A load leaves no validation state behind: what was on screen belonged to
      // the value that has just been replaced — and no submit of it was attempted.
      epoch += 1;
      summary.set(null);
      submitted.set(false);
    }
  };

  /**
   * Every child is STARTED in declaration order, and whatever each one decides
   * synchronously is on record before this returns (BUG-41 §4.2). The form-level rule runs
   * once the children have answered — at once if all of them did, after them if not.
   */
  const validateSubtree = (ctx: ValidateCtx): Promise<void> | undefined => {
    const mine = (epoch += 1);
    const at = valueEpoch();
    const pending: Promise<void>[] = [];
    for (const node of nodes.values()) {
      const late = internalsOf(node).validateSubtree(ctx);
      if (late !== undefined) pending.push(late);
    }
    return pending.length === 0
      ? summarise(ctx, mine, at)
      : Promise.all(pending).then(() => summarise(ctx, mine, at));
  };

  /**
   * EVERY rule of the summary runs (BUG-42 §4.6). What the synchronous ones found is on record
   * at once, so a submit decides on it; the whole union follows when some rule answers later.
   */
  const summarise = (ctx: ValidateCtx, mine: number, at: number): Promise<void> | undefined => {
    const { now, later } = allFailures(settle.watch(rules, at), untrack(read), ctx.root);
    if (later === undefined) {
      record(now, at);
      return undefined;
    }
    if (now !== null) record(now, at);
    return later.then((all) => {
      if (mine === epoch) record(all, at);
    });
  };

  /** The own rules alone, after a control below validated on its own: see `adopt`'s `above`. */
  let above: () => void;
  const resummarise = (): void => {
    void summarise({ root, server: false }, (epoch += 1), valueEpoch());
    above();
  };

  const collect = (path: string, out: Record<string, Errors>): void => {
    each((name, node) => {
      node.collect(join(path, name), out);
    });
  };

  const clean = (): boolean =>
    untrack(summary) === null && children().every((node) => node.clean());

  /** Some control below has been through the user's hands, or never needed to be. */
  const counts = (): boolean => children().some((node) => node.counts());

  /**
   * The validity of the tree (BUG-42 §4.3): every child valid, and its own rules holding. Those
   * count under `Rules`, or under `Interacted` as soon as some control below counts — a rule that
   * compares two fields says nothing about a form nobody has touched.
   */
  const valid = computed((): boolean => {
    if (!children().every((node) => node.valid())) return false;
    const policy = options.validity ?? inheritedValidity ?? DEFAULT_VALIDITY;
    if (policy !== Validity.Rules && !counts()) return true;
    const at = valueEpoch();
    if (!holds(clientRules, read(), root, (rule) => settle.settled(rule, at))) return false;
    return summary() === null || publishedAt !== at;
  });

  /** Its own texts, then — after a submit — the visible errors below, in declaration order. */
  const issues = (path: string, out: Issue[]): void => {
    for (const message of messages()) out.push({ path, message });
    if (!submitted()) return;
    each((name, node) => {
      node.issues(join(path, name), out);
    });
  };

  const messages = (): string[] => {
    const e = summary();
    return e === null ? [] : messagesOf(e, options.messages);
  };

  const resolve = (path: string): NodeInternals | undefined => {
    let node: AnyNode | undefined;
    let current: NodeInternals = internals;
    for (const step of path.split('.')) {
      node = current.child(step);
      if (node === undefined) {
        return undefined;
      }
      current = internalsOf(node);
    }
    return current;
  };

  const internals: NodeInternals = {
    kind: 'form',
    clone: () => build(schema, options, validators),
    read,
    set: (v) => {
      write(v as Record<string, unknown>, 'set');
    },
    patch: (v) => {
      write(v as Record<string, unknown>, 'patch');
    },
    check,
    validateSubtree,
    // A nested form passes the adoption down: its fields' root is the form above it, and their
    // policy is this form's own when it chose one.
    adopt: (outer, validateOn, validity, up) => {
      root = outer;
      inheritedValidity = validity;
      above = up;
      each((_, node) => {
        node.adopt(outer, options.validateOn ?? validateOn, options.validity ?? validity, resummarise);
      });
    },
    // A group's own error is its summary: the map of `$errors()` is about fields.
    publish: (e) => {
      record(e, valueEpoch());
    },
    child: nodeOf,
    collect,
    clean,
    valid,
    counts,
    epoch: valueEpoch,
    issues,
    markSubmitted: () => {
      submitted.set(true);
      each((_, node) => {
        node.markSubmitted();
      });
    },
    touchAll: () => {
      each((_, node) => {
        node.touchAll();
      });
    },
    resetAll: () => {
      epoch += 1;
      each((_, node) => {
        node.resetAll();
      });
      summary.set(null);
      submitted.set(false);
    },
    clearAll: () => {
      each((_, node) => {
        node.clearAll();
      });
      summary.set(null);
    },
  };

  const api = {
    $value: read,

    $set: (v: Value<S>): void => {
      // Checked whole before anything is written: a failed `$set` leaves the form
      // exactly as it was, instead of half assigned up to the offending field.
      check(v, 'set', '');
      write(v as Record<string, unknown>, 'set');
    },

    $patch: (v: Patch<S>): void => {
      check(v, 'patch', '');
      write(v as Record<string, unknown>, 'patch');
    },

    $validate: async (opts: { readonly server?: boolean } = {}): Promise<boolean> => {
      await validateSubtree({ root: self as unknown as AnyForm, server: opts.server === true });
      return untrack(clean);
    },

    $errors: (): ErrorMap | null => {
      const out: Record<string, Errors> = {};
      collect('', out);
      return Object.keys(out).length > 0 ? out : null;
    },

    $summary: (): Errors | null => summary(),

    $message: (): string => messages()[0] ?? '',

    $messages: (): readonly string[] => messages(),

    $issues: (): readonly Issue[] => {
      const out: Issue[] = [];
      issues('', out);
      return out;
    },

    $submitted: (): boolean => submitted(),

    $valid: (): boolean => valid(),

    $setErrors: (errors: ErrorMap | null, sum?: Errors | null): void => {
      if (errors === null) {
        internals.clearAll();
        return;
      }
      for (const [path, e] of Object.entries(errors)) {
        // A path this schema does not have is ignored: a server cannot bring the
        // page down by naming a field that is not here.
        resolve(path)?.publish(e);
      }
      if (sum !== undefined) {
        record(sum, valueEpoch());
      }
    },

    $touch: (): void => {
      internals.touchAll();
    },

    $reset: (): void => {
      internals.resetAll();
    },

    $fields: (): readonly (keyof S & string)[] => fields,

    $schema: schema,
  };

  const self = attach(
    Object.assign(Object.fromEntries(nodes), api) as unknown as Form<S>,
    internals,
  );
  // Every field starts out with THIS form as its root. If this form is itself cloned into
  // another as a group, that one adopts it in turn and the root moves outwards.
  internals.adopt(self as unknown as AnyForm, undefined, undefined, () => {});
  return self;
}
