/**
 * What a call that carries files is allowed, and where its files wait while the handler runs
 * (SDD-81 §3.5).
 */

/** The limits of one call that carries files. */
export interface UploadLimits {
  /** Per file, unless its field says `max-size`. Bytes. Default 10 MB. */
  readonly maxFileSize: number;
  /** Files per call. Default 20. */
  readonly maxFiles: number;
  /** The `$args` part. Bytes. Default 1 MB. */
  readonly maxArgs: number;
}

/**
 * Where an incoming file waits while the handler runs: the adapter's choice, never the
 * project's. It takes the part's bytes as they arrive and gives back the `File` the handler
 * sees; what it kept goes when `release` is called, once the response's body is done or
 * cancelled.
 */
export interface Spool {
  put(bytes: ReadableStream<Uint8Array>, meta: { readonly name: string; readonly type: string }): Promise<File>;
  release(): Promise<void>;
}
