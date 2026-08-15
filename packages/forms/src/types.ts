/**
 * The type surface of a form. Every type lives here and every implementation
 * imports from here, so no two modules can disagree and nothing needs a cycle.
 *
 * The shape of a node follows the reactivity of `@fudic/core`: a control is READ
 * BY CALLING IT, exactly like a signal, and so are its errors, its touched flag
 * and its dirty flag. A form is the place where the most reactive state is read
 * in a single file, and two ways of reading in that file — `count()` for a signal
 * and `title.value` for a control — is one too many.
 */

/** The errors of one node. `{ required: true }`, `{ minLength: 3 }`, `{ range: 'u8' }`. */
export type Errors = Readonly<Record<string, unknown>>;

/** Anything readable in a tracked way. The `Readable<T>` of `@fudic/core`. */
export type Readable<T> = () => T;

/**
 * A leaf. Holds a value and the interaction state around it, and nothing else:
 * `disabled` belongs to the element, not to the model.
 */
export interface Control<T> {
  /** TRACKED read of the value. The only way to read it. */
  (): T;
  /** Write. Normalises `undefined` to `null` and updates `dirty`. */
  set(v: T): void;
  /** Errors of the last validation, or `null`. Tracked read. */
  readonly errors: Readable<Errors | null>;
  /** The user has been through this field. Whoever binds it decides, not the model. */
  readonly touched: Readable<boolean>;
  /** The value differs from the initial one (`Object.is`). */
  readonly dirty: Readable<boolean>;
  /** Marks `touched`. Idempotent. */
  touch(): void;
  /** Back to the initial value, or to the given one. Clears errors, touched and dirty. */
  reset(v?: T): void;
}

/** The width a typed control declares. Inert data for the model, contract for transport. */
export type TypeTag =
  | 'u8'
  | 'i8'
  | 'u16'
  | 'i16'
  | 'u32'
  | 'i32'
  | 'f32'
  | 'f64'
  | 'bool'
  | 'str'
  | 'date'
  | 'arr';

/**
 * A control that also declares its type. The declared width IS a range, so it
 * validates; the encoder that turns it into bytes belongs to transport.
 */
export interface TypedControl<T> extends Control<T> {
  readonly type: TypeTag;
  /** Only on `arr`: the tag of its elements. */
  readonly of?: TypeTag;
}

/**
 * A validator. Takes the value and the ROOT form, for the rules that look at
 * another field. Returns `null` when the value is good. May be asynchronous.
 */
export type Validator<T> = (value: T, root: AnyForm) => Errors | null | Promise<Errors | null>;

/** A schema is an object of nodes. Its key order is the contract both ends share. */
export interface Schema {
  readonly [field: string]: AnyNode;
}

/** A node is a control or a nested form. Two kinds, not three (a group IS a form). */
export type AnyNode = Control<unknown> | AnyForm;

/** A form whose schema is not statically known: what a validator receives as `root`. */
export type AnyForm = Form<Schema>;

/** The value of one node. */
export type ValueOf<N> = N extends Control<infer T>
  ? T
  : N extends { readonly $schema: infer S extends Schema }
    ? Value<S>
    : never;

/** The value of a whole schema, in keyed form. */
export type Value<S extends Schema> = { [K in keyof S]: ValueOf<S[K]> };

/** Errors of a whole form, indexed by path: `{ title: {…}, 'seo.canonical': {…} }`. */
export type ErrorMap = Readonly<Record<string, Errors>>;

/** What `form()` takes besides its schema. */
export interface FormOptions<S extends Schema> {
  /** The form-level rule: the error that belongs to no single field. */
  readonly summary?: (root: Form<S>) => Errors | null | Promise<Errors | null>;
}

/** The `$` namespace of a form. Its fields hang next to it, by name. */
export interface FormApi<S extends Schema> {
  /** The whole value, keyed. TRACKED: reading it inside an effect subscribes it. */
  readonly $value: Readable<Value<S>>;
  /** TOTAL assignment. A missing field is a `TypeError` naming it; nothing empties in silence. */
  $set(v: Value<S>): void;
  /** PARTIAL assignment. What is not mentioned is not touched. */
  $patch(v: Partial<Value<S>>): void;

  /** Runs the validators and publishes the result. Resolves to whether the form is valid. */
  $validate(opts?: { readonly server?: boolean }): Promise<boolean>;
  /** The error map by path of the last validation, or `null`. Tracked read. */
  readonly $errors: Readable<ErrorMap | null>;
  /** The form-level error, or `null`. Tracked read. */
  readonly $summary: Readable<Errors | null>;
  /** Publishes errors that came from outside (a 422), indexed by path. */
  $setErrors(errors: ErrorMap | null, summary?: Errors | null): void;

  /** `touch()` all the way down. What a submit needs for the errors to be visible. */
  $touch(): void;
  /** Back to the initial state: values, errors, touched and dirty. */
  $reset(): void;

  /** The field names, in declaration order. */
  $fields(): readonly (keyof S & string)[];
  /** The schema as declared. It is the template both ends import, and it is inert. */
  readonly $schema: S;
}

/** A form is its `$` API plus its fields by name. */
export type Form<S extends Schema> = FormApi<S> & { readonly [K in keyof S]: S[K] };

/** A group IS a nested form. That is why there is no third kind of node. */
export type GroupNode<S extends Schema> = Form<S>;
