/**
 * A runtime piece the generated page coordinator starts, such as hydration or the dependency
 * container. Pieces that are only imported, like `signal`, do not implement it.
 */
export interface RuntimeEntry<Options> {
  install(options: Options): unknown;
}
