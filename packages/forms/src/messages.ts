/**
 * The TEXT of an error map (SDD-34 §3.2).
 *
 * A validator returns `{ required: true }` or `{ minLength: 3 }` — the RULE and what it was
 * measured against, never a sentence. Turning that into words is the application's job, and
 * where those words come from — a bundle, a translation file, a server — is the application's
 * too; internationalisation is out of scope (§7) and this is the seam it will plug into.
 *
 * Without a message the rule CODE is written. That is deliberate rather than a placeholder: a
 * form with no messages configured shows `required` next to the field, which is wrong for a
 * user and unmistakable for a developer — where an empty string would look like a form that
 * works.
 *
 * **It lives in the MODEL and not behind `./dom`, and that is the invariant of §4.3 showing
 * up in the module graph.** The server writes the text of an error into the HTML it renders —
 * a form arriving with a 422 already painted is accessible with zero JS — so the function that
 * turns `{ required: true }` into a sentence has to run on both ends. It touches no DOM: it
 * reads a record and returns a string.
 */

import type { Errors } from './types.js';

/** rule name → the sentence for it, given whatever the validator measured against. */
export type Messages = Readonly<Record<string, (v: unknown) => string>>;

/**
 * Module state, and the one piece of it in this package.
 *
 * It is what the API declares — `setMessages(m)` — and a per-form registry would be worse: the
 * texts of an application are one set, and threading them through every `bind*` call would put
 * them in the emit, where the author cannot reach them.
 */
let messages: Messages = {};

/** Install the message map. Replaces whatever was there: it is a configuration, not a merge. */
export function setMessages(m: Messages): void {
  messages = m;
}

/**
 * The sentence for an error map: the FIRST rule that failed.
 *
 * One rule and not all of them, because a field shows one message. Which one is the first the
 * validator published, and the order of a validator list is the author's own.
 */
export function errorText(errors: Errors): string {
  for (const rule of Object.keys(errors)) {
    const message = messages[rule];
    return message === undefined ? rule : message(errors[rule]);
  }
  // An empty map is not an error: a validator that found nothing returns `null`.
  return '';
}
