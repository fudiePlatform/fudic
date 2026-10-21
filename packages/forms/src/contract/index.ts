/**
 * `@fudic/forms/contract`: what the modules generated from a `.fudapi` import (SDD-60 §3.10).
 * Internal: the developer never writes against it. The factories and validators are today's;
 * what is new is the registry of implementations, the rules declared in a `.fudapi`, `require`,
 * the templates of the texts and `uuid`.
 */

export { form, build } from '../form.js';
export { group } from '../group.js';
export { DEFAULT_CATCHES } from '../catches.js';
export { u8 } from '../typed/u8.js';
export { i8 } from '../typed/i8.js';
export { u16 } from '../typed/u16.js';
export { i16 } from '../typed/i16.js';
export { u32 } from '../typed/u32.js';
export { i32 } from '../typed/i32.js';
export { f32 } from '../typed/f32.js';
export { f64 } from '../typed/f64.js';
export { bool } from '../typed/bool.js';
export { str } from '../typed/str.js';
export { date } from '../typed/date.js';
export { arr } from '../typed/arr.js';
export { uuid, UUID } from './uuid.js';
export { formOf, type Bool, type DateField, type List, type Num, type Str, type Validated } from './form.js';
export { rule, camel, type Check, type Rule, type RuleSpec, type Verdict } from './rule.js';
export {
  compare,
  contains,
  isEmpty,
  lengthOf,
  requireOn,
  requireRule,
  same,
  validAt,
  valueAt,
  type Test,
} from './require.js';
export { messages, text } from './text.js';
export {
  Slot,
  folderOf,
  loadingFile,
  resetRegistry,
  setFolders,
  type Side,
} from './registry.js';
export type { AnyForm, Form, Schema } from '../types.js';
