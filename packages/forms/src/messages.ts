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

import type { Errors, Messages } from './types.js';

export type { Messages };

/**
 * Module state, and the one piece of it in this package.
 *
 * It is what the API declares — `setMessages(m)` — and it is the FALLBACK since BUG-41: a
 * control or a form can carry its own texts, and those win. What stays global is the default
 * sentence of a rule, which is one set per application.
 */
let messages: Messages = {};

/** Install the message map. Replaces whatever was there: it is a configuration, not a merge. */
export function setMessages(m: Messages): void {
  messages = m;
}

/**
 * The sentence for an error map: the FIRST rule that failed, worded by `own` if it knows the
 * rule, by the global map if not, and by the rule's own code as the last resort (BUG-41 §4.4).
 *
 * One rule and not all of them, because a field shows one message. Which one is the first the
 * validator published, and the order of a validator list is the author's own.
 */
export function messageOf(errors: Errors, own: Messages = {}): string {
  // An empty map is not an error: a validator that found nothing returns `null`.
  return messagesOf(errors, own)[0] ?? '';
}

/**
 * The sentence for EVERY rule of an error map, in its key order, with the same chain as
 * `messageOf` (BUG-42 §4.6). What a summary says: a form or a group lists all that is wrong with
 * it, where a field says one thing.
 */
export function messagesOf(errors: Errors, own: Messages = {}): string[] {
  return Object.keys(errors).map((rule) => {
    const message = own[rule] ?? messages[rule];
    return message === undefined ? rule : message(errors[rule]);
  });
}

/** The sentence for an error map, with the global texts only. */
export function errorText(errors: Errors): string {
  return messageOf(errors);
}
