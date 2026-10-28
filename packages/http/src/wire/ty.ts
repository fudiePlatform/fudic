/**
 * The types of a `.fudapi` on the wire (SDD-60 §3.2, SDD-67 §3.1). A type travels as a small
 * descriptor the generated module writes: a primitive by its name, the rest as an object. A
 * `type` is a function returning its fields, so a type may name itself through `[]`, `?` or
 * `map`.
 *
 * `any` is not a type of the `.fudapi`: it is the value a validator leaves in `Errors`, and it
 * only exists inside a problem.
 */

export type Primitive = 'str' | 'html' | 'bool' | 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'f32' | 'f64' | 'date' | 'uuid';

export type Ty =
  | Primitive
  | 'any'
  | { readonly list: Ty }
  | { readonly opt: Ty }
  | { readonly map: readonly [Ty, Ty] }
  | { readonly oneOf: readonly string[] }
  | { readonly fields: () => Readonly<Record<string, Ty>> };
