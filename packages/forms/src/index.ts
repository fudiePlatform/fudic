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

export type {
  AnyForm,
  AnyNode,
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
