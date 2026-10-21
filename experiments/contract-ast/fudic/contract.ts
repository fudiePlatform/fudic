/**
 * Stub of what a contract imports from fudic: the marker types of IDEA-05 §3. They exist
 * only so `tsc` checks the simulations; the extractor recognises them by import specifier
 * and never reads this file.
 */

declare const width: unique symbol;
type Width<W extends string> = number & { readonly [width]?: W };

export type u8 = Width<'u8'>;
export type i8 = Width<'i8'>;
export type u16 = Width<'u16'>;
export type i16 = Width<'i16'>;
export type u32 = Width<'u32'>;
export type i32 = Width<'i32'>;
export type f32 = Width<'f32'>;
export type f64 = Width<'f64'>;

/** What a function says besides its signature. */
export interface FnOptions {
  /** Paths or route patterns whose cached data the call leaves stale. */
  readonly invalidates?: readonly string[];
  readonly compress?: 'gzip' | 'deflate' | 'deflate-raw' | false;
}

/** What a page's `load` says besides its signature. */
export interface LoadOptions {
  readonly strategy?: 'ssg' | 'ssr' | 'sw';
}

type Fn = (...args: never[]) => unknown;

declare const verb: unique symbol;
type Marked<V extends string, F extends Fn> = F & { readonly [verb]?: V };

export type Get<F extends Fn, M extends readonly unknown[] = [], O extends FnOptions = {}> = Marked<'GET', F> & { readonly '~m'?: M; readonly '~o'?: O };
export type Post<F extends Fn, M extends readonly unknown[] = [], O extends FnOptions = {}> = Marked<'POST', F> & { readonly '~m'?: M; readonly '~o'?: O };
export type Put<F extends Fn, M extends readonly unknown[] = [], O extends FnOptions = {}> = Marked<'PUT', F> & { readonly '~m'?: M; readonly '~o'?: O };
export type Patch<F extends Fn, M extends readonly unknown[] = [], O extends FnOptions = {}> = Marked<'PATCH', F> & { readonly '~m'?: M; readonly '~o'?: O };
export type Delete<F extends Fn, M extends readonly unknown[] = [], O extends FnOptions = {}> = Marked<'DELETE', F> & { readonly '~m'?: M; readonly '~o'?: O };
export type Load<F extends Fn, O extends LoadOptions = {}> = Marked<'LOAD', F> & { readonly '~o'?: O };
