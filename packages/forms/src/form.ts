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

import { signal, untrack } from '@fudic/core';
import {
  attach,
  internalsOf,
  join,
  type NodeInternals,
  type ValidateCtx,
  type WriteMode,
} from './internals.js';
import type {
  AnyForm,
  AnyNode,
  ErrorMap,
  Errors,
  Form,
  FormOptions,
  Schema,
  Validator,
  Value,
} from './types.js';

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
  validators: readonly Validator<Value<S>>[],
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
  /** Bumped by every validation pass over this form; an overtaken pass publishes nothing. */
  let epoch = 0;

  const nodeOf = (name: string): AnyNode | undefined => nodes.get(name);
  const each = (fn: (name: string, node: NodeInternals) => void): void => {
    for (const [name, node] of nodes) {
      fn(name, internalsOf(node));
    }
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
  };

  const validateSubtree = async (ctx: ValidateCtx): Promise<void> => {
    const mine = (epoch += 1);
    for (const node of nodes.values()) {
      await internalsOf(node).validateSubtree(ctx);
    }
    let found: Errors | null = null;
    for (const rule of validators) {
      const result = await rule(untrack(read), ctx.root);
      if (result) {
        found = result;
        break;
      }
    }
    if (found === null && options.summary) {
      found = await options.summary(self);
    }
    if (mine !== epoch) {
      return;
    }
    summary.set(found);
  };

  const collect = (path: string, out: Record<string, Errors>): void => {
    each((name, node) => {
      node.collect(join(path, name), out);
    });
  };

  const valid = (): boolean => {
    if (untrack(summary) !== null) {
      return false;
    }
    for (const node of nodes.values()) {
      if (!internalsOf(node).valid()) {
        return false;
      }
    }
    return true;
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
    // A group's own error is its summary: the map of `$errors()` is about fields.
    publish: (e) => {
      summary.set(e);
    },
    child: nodeOf,
    collect,
    valid,
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

    $patch: (v: Partial<Value<S>>): void => {
      check(v, 'patch', '');
      write(v as Record<string, unknown>, 'patch');
    },

    $validate: async (opts: { readonly server?: boolean } = {}): Promise<boolean> => {
      await validateSubtree({ root: self as unknown as AnyForm, server: opts.server === true });
      return untrack(valid);
    },

    $errors: (): ErrorMap | null => {
      const out: Record<string, Errors> = {};
      collect('', out);
      return Object.keys(out).length > 0 ? out : null;
    },

    $summary: (): Errors | null => summary(),

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
        summary.set(sum);
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
  return self;
}
