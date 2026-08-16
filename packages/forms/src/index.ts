/**
 * Entry point of `@fudic/forms` — the form model, and nothing that touches the DOM.
 *
 * A form here can be built, filled, validated and read without a `<form>` existing
 * anywhere. That is not a feature of this package, it is the invariant that defines
 * it: it is what lets the same schema file be imported by the client, by the
 * prerender and by the server.
 *
 * Everything is a loose named export in its own module, and that is a requirement
 * rather than a style: this package reaches the browser, so a route must be able to
 * prune what it does not use. Whoever never imports `pattern` does not download a
 * `RegExp`, and whoever never imports a typed factory does not download a single
 * range check. That is why there is no `control.u8()` and no `validator.server()`:
 * a namespace hung off a factory is exactly the shape a bundler cannot drop.
 */

export const VERSION = '0.0.1';

export { control } from './control.js';
export { form } from './form.js';
export { group } from './group.js';

export { validator } from './validators/validator.js';
export { serverValidator } from './validators/server.js';
export { required } from './validators/required.js';
export { minLength } from './validators/min-length.js';
export { maxLength } from './validators/max-length.js';
export { min } from './validators/min.js';
export { max } from './validators/max.js';
export { pattern } from './validators/pattern.js';

export { u8 } from './typed/u8.js';
export { i8 } from './typed/i8.js';
export { u16 } from './typed/u16.js';
export { i16 } from './typed/i16.js';
export { u32 } from './typed/u32.js';
export { i32 } from './typed/i32.js';
export { f32 } from './typed/f32.js';
export { f64 } from './typed/f64.js';
export { bool } from './typed/bool.js';
export { str } from './typed/str.js';
export { date } from './typed/date.js';
export { arr } from './typed/arr.js';

export type {
  AnyForm,
  AnyNode,
  AnyValidator,
  Control,
  ErrorMap,
  Errors,
  Form,
  FormApi,
  FormOptions,
  GroupNode,
  Readable,
  Schema,
  TypeTag,
  TypedControl,
  Validator,
  Value,
  ValueOf,
} from './types.js';
