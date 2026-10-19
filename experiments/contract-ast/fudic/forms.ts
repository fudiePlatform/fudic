/**
 * Stub of the slice of `@fudic/forms` the simulations use, with the real call shapes. Only
 * for `tsc`: the extractor reads the calls by name and never reads this file.
 */

export type Errors = Readonly<Record<string, unknown>>;
export type Validator<T> = (value: T) => Errors | null | Promise<Errors | null>;
export interface ControlOptions {
  readonly messages?: Readonly<Record<string, (arg: never) => string>>;
}
export interface Control<T> {
  readonly '~value'?: T;
}
export interface Form<S> {
  readonly '~schema'?: S;
}
export interface FormOptions {
  readonly catches?: readonly number[];
}

type Typed<T> = (initial?: T, validators?: readonly Validator<T>[], options?: ControlOptions) => Control<T>;

export declare const str: Typed<string>;
export declare const bool: Typed<boolean>;
export declare const date: Typed<Date | null>;
export declare const u8: Typed<number | null>;
export declare const i8: Typed<number | null>;
export declare const u16: Typed<number | null>;
export declare const i16: Typed<number | null>;
export declare const u32: Typed<number | null>;
export declare const i32: Typed<number | null>;
export declare const f32: Typed<number | null>;
export declare const f64: Typed<number | null>;
export declare function arr<T>(of: () => Control<T>, initial?: readonly T[], validators?: readonly Validator<readonly T[]>[], options?: ControlOptions): Control<readonly T[]>;
export declare function group<S>(schema: S): Form<S>;
export declare function form<S>(schema: S, options?: FormOptions): Form<S>;

export declare const required: Validator<unknown>;
export declare const email: Validator<unknown>;
export declare function min(n: number): Validator<unknown>;
export declare function max(n: number): Validator<unknown>;
export declare function minLength(n: number): Validator<unknown>;
export declare function maxLength(n: number): Validator<unknown>;
export declare function pattern(re: RegExp): Validator<unknown>;
export declare function serverValidator<T>(fn: (value: T) => Promise<Errors | null>): Validator<T>;
