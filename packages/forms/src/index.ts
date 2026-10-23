/**
 * Entry point of `@fudic/forms` — the form model, and nothing that touches the DOM.
 *
 * A form here can be built, filled, validated and read without a `<form>` existing
 * anywhere. That is not a feature of this package, it is the invariant that defines
 * it: it is what lets the same declaration be imported by the client, by the
 * prerender and by the server.
 *
 * A form is declared in a `.fudapi` (SDD-60 §3.6), and what fudic generates of it builds it
 * through `./contract`: the factories, the validators and `form` itself are not written by the
 * developer any more. What stays here is the type of a form and of its `$…` API, and what the
 * server and the compiler need to paint its errors.
 */

export const VERSION = '0.0.1';

// The text of an error, and the map that supplies it. In the model and not behind `./dom`
// because the SERVER writes that text into the HTML it renders (SDD-34 §4.3): a form that
// arrives with its errors already painted is accessible with zero JavaScript.
export { errorText, SERVER_RULE, type Messages } from './messages.js';
// The markup of a summary, for the same reason: the server writes it and the client repaints it,
// and one function is what keeps the two byte for byte (BUG-42 §4.6).
export {
  issueId,
  summaryEntries,
  summaryEntriesOf,
  summaryMarkup,
  summaryOf,
  type SummaryEntry,
} from './summary-markup.js';

export { DEFAULT_CATCHES } from './catches.js';

export type {
  AnyForm,
  AnyNode,
  AnyValidator,
  Control,
  ControlOptions,
  ErrorMap,
  Errors,
  Form,
  FormApi,
  FormOptions,
  GroupNode,
  GroupOptions,
  Issue,
  Positional,
  Readable,
  Schema,
  TypeTag,
  TypedControl,
  Validator,
  Value,
  ValueOf,
} from './types.js';
