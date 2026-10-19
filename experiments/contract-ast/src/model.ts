/**
 * What the extractor leaves of a simulation: the normalised contract a backend generator would
 * read, and every place where the Oxc AST alone was not enough. A generator for C#, Java, Go or
 * Rust would start from this, never from the AST.
 */

export type Width = 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'f64';

export type TypeModel =
  | { readonly kind: 'string' | 'boolean' | 'void' | 'date' }
  /** `width: null` is a bare `number`: no backend knows what to make of it. */
  | { readonly kind: 'number'; readonly width: Width | null }
  | { readonly kind: 'array'; readonly of: TypeModel }
  | { readonly kind: 'record'; readonly of: TypeModel }
  | { readonly kind: 'nullable'; readonly of: TypeModel }
  | { readonly kind: 'enum'; readonly values: readonly (string | number)[] }
  | { readonly kind: 'object'; readonly fields: readonly Field[] }
  /** A declared type, kept by name: a DTO in the backend. Its body is in `types`. */
  | { readonly kind: 'named'; readonly ref: string }
  /** A form passed whole: its schema is in `forms`. */
  | { readonly kind: 'form'; readonly ref: string }
  | { readonly kind: 'unsupported'; readonly what: string };

export interface Field {
  readonly name: string;
  readonly optional: boolean;
  readonly type: TypeModel;
}

export interface NamedType {
  readonly name: string;
  readonly file: string;
  readonly type: TypeModel;
}

export type Verb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'LOAD';

export interface Param {
  readonly name: string;
  readonly optional: boolean;
  readonly type: TypeModel;
}

export interface FunctionModel {
  readonly name: string;
  readonly verb: Verb;
  readonly params: readonly Param[];
  readonly result: TypeModel;
  /** Refs into `middlewares`, in the order written. */
  readonly middlewares: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
}

export interface ContractModel {
  readonly kind: 'route' | 'component' | 'unknown';
  /** The `.fud` whose `<link rel="server">` points here. */
  readonly fud: string;
  readonly file: string;
  readonly interface: string;
  readonly functions: readonly FunctionModel[];
}

export interface MiddlewareModel {
  readonly name: string;
  readonly file: string;
  /** What it leaves in `ctx`: a typed field of every function's `ctx` in the backend. */
  readonly adds: TypeModel | null;
  readonly client: boolean;
}

export interface ValidatorModel {
  readonly name: string;
  readonly args: readonly unknown[];
}

export type FormField =
  | {
      readonly name: string;
      readonly control: string;
      readonly type: TypeModel;
      readonly initial: unknown;
      readonly validators: readonly ValidatorModel[];
      /** Keys only: the messages themselves are client TS and never cross. */
      readonly messages: readonly string[];
    }
  | { readonly name: string; readonly group: readonly FormField[] };

export interface FormModel {
  readonly name: string;
  readonly file: string;
  readonly fields: readonly FormField[];
  readonly catches: readonly number[];
}

export interface Issue {
  /** `error`: the contract cannot be generated as written. `note`: it can, with a decision. */
  readonly severity: 'error' | 'note';
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly line: number;
  readonly col: number;
}

export interface SimModel {
  readonly sim: string;
  readonly files: readonly string[];
  readonly contracts: readonly ContractModel[];
  readonly types: Readonly<Record<string, NamedType>>;
  readonly middlewares: Readonly<Record<string, MiddlewareModel>>;
  readonly forms: Readonly<Record<string, FormModel>>;
  readonly issues: readonly Issue[];
}
