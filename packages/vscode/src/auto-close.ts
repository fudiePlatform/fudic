/**
 * Closing a tag as it is typed (BUG-22).
 *
 * `<div>` becomes `<div></div>` with the caret between the two, which every editor does for
 * HTML and a `.fud` did not. The rule itself is not here and could not be: whether a `>` ends a
 * start tag at all is a question about the parse — the one in `title="a > b"` does not — and
 * the server is the only thing that has the tree. This module is the wire.
 *
 * Pure, like everything else under `src/`: the editor arrives as a port.
 */

import type { LanguageClientPort, TypedText, TypingPort } from './ports.js';

/** The request the server answers. Spelled here rather than imported, as the others are. */
export const AUTO_CLOSE_TAG_REQUEST = 'fudic/autoCloseTag';

/** The client of the moment: a restart replaces it, and this listener outlives restarts. */
export interface ClientHolder {
  readonly client: LanguageClientPort;
}

/**
 * Whether an edit can possibly be closing a tag.
 *
 * Exactly one `>`, typed. Not a paste that ends in one, not an edit the extension itself made:
 * the answer to `<div>>` is nothing, and a round trip per keystroke is a round trip too many.
 */
const closesATag = (typed: TypedText | undefined): typed is TypedText => typed?.text === '>';

/**
 * Watch for a `>` and close the tag it opened.
 *
 * Failures are swallowed on purpose. This runs on every keystroke, and a server that is
 * restarting or has just died would otherwise raise a modal per character — for a feature
 * whose worst failure is that the user types six more characters themselves.
 */
export function watchTypedTags(typing: TypingPort, holder: ClientHolder): void {
  typing.onTyped((typed) => {
    if (!closesATag(typed)) return;

    // Asked on the NEXT macrotask, and that is the whole fix: this listener and the language
    // client's own listen to the same editor event, this one runs first, and the client's
    // `didChange` is sent from a promise chain. Asking straight away put the request on the
    // wire ahead of the `>` that caused it — the server answered about a document it had not
    // been told about yet, found no end of start tag, and answered nothing, every time. A
    // timer of zero runs after the microtask queue drains, so the notification goes first.
    setTimeout(() => {
      void holder.client
        .sendRequest<string>(AUTO_CLOSE_TAG_REQUEST, { uri: typed.uri, offset: typed.offset })
        .then(async (tag) => {
          if (tag === '') return;
          await typing.insert({ ...typed, text: tag });
        })
        .catch(() => undefined);
    }, 0);
  });
}
