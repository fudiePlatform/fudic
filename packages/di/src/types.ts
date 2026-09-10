declare const TYPE: unique symbol;

/**
 * A token for a value that is not a class: a request, an env, a locale. The phantom type
 * parameter is why this is an object and not a bare `symbol` — a symbol cannot carry `T`,
 * and without `T` every `inject(TOK)` would come back `unknown`.
 */
export interface Token<T> {
  readonly name: string;
  readonly [TYPE]?: T;
}

/** What `inject` asks for: a class, or a token. Both are compared by identity. */
export type Provider<T> = (abstract new (...args: never[]) => T) | Token<T>;

export interface ProvideOptions {
  /** Never cached. A new instance per resolution, in the container that resolved it. */
  readonly transient?: true;
}

export interface InjectOptions {
  /** Missing registration returns `undefined` instead of throwing. */
  readonly optional?: true;
}

/** A container. Opaque: nothing outside this package reads its fields. */
export interface Container {
  readonly label: string;
}
