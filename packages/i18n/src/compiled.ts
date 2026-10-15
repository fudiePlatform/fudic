/**
 * The precompiled form of an ICU message (SDD-58 §3.2): what `compileMessage` produces, what
 * the compiler writes into a module as a literal and what `$message` renders. Plain JSON —
 * no class, no function — so it can travel inside emitted code and to another backend.
 */

/** A message: its parts, in order. */
export type CompiledMessage = readonly MessagePart[];

/** One part of a message. */
export type MessagePart =
  /** Literal text, already unescaped. */
  | string
  /** `{name}`: the value of a hole. */
  | { readonly hole: string }
  /** `#` inside a plural: the plural's value, formatted as a number. */
  | { readonly pound: string }
  /** `<n>…</n>`, or `<n/>` when `children` is absent: the n-th inline element of the original. */
  | { readonly tag: number; readonly children?: CompiledMessage }
  /** `{name, plural, …}`: `=N` and CLDR categories in `cases`, the mandatory `other` apart. */
  | {
      readonly plural: string;
      readonly cases: Readonly<Record<string, CompiledMessage>>;
      readonly other: CompiledMessage;
    }
  /** `{name, select, …}`: one case per value, the mandatory `other` apart. */
  | {
      readonly select: string;
      readonly cases: Readonly<Record<string, CompiledMessage>>;
      readonly other: CompiledMessage;
    };

/** The argument a hole, a plural or a select is given. */
export type MessageArg = string | number | bigint;
