/**
 * What a compiled component's `static c(props)` returns. Values cross a shadow boundary,
 * never signals, so a parent pushes new values to a child through `u`.
 */
export interface Controller {
  /** Builds the nodes, for an instance created in the browser. */
  c(): void;
  /** Adopts the server-rendered nodes. */
  h(): void;
  /**
   * Re-applies values, in the same positional order as the initial props. The array may be
   * sparse: a hole means "unchanged", a present `undefined` means "use the default".
   */
  u(props: readonly unknown[]): void;
  /** Tears everything down. */
  r(): void;
}

/**
 * The static side of a compiled component. `props` is `[dom, shadowRoot, ...values]`.
 * A separate type because TypeScript has no `static abstract`.
 */
export interface FudicElementCtor {
  c(props: readonly unknown[]): Controller;
}
