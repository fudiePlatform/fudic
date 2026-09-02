/**
 * Opening the value list when the caret lands on a prop that has none (BUG-23).
 *
 * Expanding `<app-input>` writes `.id=` and `.name=` with a tabstop at each value, and a
 * tabstop is where the editor will not help by itself: VS Code fires quick suggestions from a
 * KEYSTROKE, and arriving at a tabstop is not one. The tag's own completion item covers the
 * first prop — a command chained to an accepted item — and nothing covered the rest, so the
 * second prop was as blank as before the snippet existed.
 *
 * Watching the caret is the only wire available for those: nothing was typed, so there is no
 * typing event to hang it on.
 *
 * Tab is NOT left as VS Code defines it, and that is the other half of this (BUG-23 task 25).
 * By default an open list with a focused item makes Tab an accept, so arriving at `.id=` with
 * the list open meant Tab wrote `@items` into a `number` instead of moving on to `.name`. The
 * two keybindings in `package.json` — `jumpToNextSnippetPlaceholder` / `jumpToPrevSnippetPlaceholder`
 * on `inSnippetMode && suggestWidgetVisible` — put the snippet first while a snippet is running,
 * and only in a `.fud`. Enter still accepts, and moving the caret closes the list, so the next
 * tabstop gets its own list from the watcher below rather than the previous one's leftovers.
 *
 * The complement is on the server: the list of a binding value comes back `isIncomplete`, so
 * the editor re-asks on every keystroke instead of filtering a cached reply in the client. That
 * is what makes `.id=0` close the list at all — with a complete list VS Code never asked again,
 * and whether the widget survived depended on whether the typed character happened to appear
 * inside one of the names in scope.
 */

import type { CaretAt, CaretPort } from './ports.js';

/** `.prop=` with the caret right after the `=`. The dot is what makes it a prop and not an attribute. */
const EMPTY_PROP_VALUE = /\.[A-Za-z_$][A-Za-z0-9_$]*=$/u;

/**
 * A `.prop=` or `@event=` whose value has been WRITTEN, with what was written.
 *
 * A value does not cross a blank (decision 101 read in the value), so the run stops at the
 * first space or `>`: in `.name= .id=@x` the `.name` has no value and the next attribute is
 * the next attribute.
 */
const WRITTEN_VALUE = /[.@][A-Za-z_$][A-Za-z0-9_$-]*=([^\s>]+)$/u;

/**
 * Whether the caret sits on a prop value that is still empty.
 *
 * Both sides are checked, and the pair is the whole guard — no second one is needed. What
 * precedes says it is a prop value; what FOLLOWS says it is empty. Typing into the value
 * breaks the first half on the very first character, so this cannot reopen a list over
 * something the author is writing, which is what a version check was added for and what
 * that check then broke: a typing edit and its caret event do not always carry the same
 * version, so the Tab that followed looked like an edit and the second prop stayed silent.
 */
const opensAValue = (at: CaretAt | undefined): boolean => {
  if (at === undefined) return false;
  if (!EMPTY_PROP_VALUE.test(at.text.slice(0, at.offset))) return false;

  // End of file included: a tag still being written has nothing after the caret at all.
  const next = at.text[at.offset] ?? '';
  return next === '' || next === '>' || next === '/' || /\s/u.test(next);
};

/**
 * Whether the list has to GO, because the author has written the value by hand.
 *
 * The mirror of the server's `valueBegun`, and it has to exist on this side for a reason that
 * is the editor's rather than the language's: the list at an empty value is opened by COMMAND,
 * which VS Code counts as an explicit invocation, and it does not dismiss one of those when
 * every provider answers empty — it keeps the widget up rendering «No suggestions». The server
 * was already silent at `.id=0`; the silence had nowhere to arrive. So a widget that is only
 * open because we opened it is a widget we have to close, and pressing <kbd>Esc</kbd> or Tab
 * twice is not the developer's job.
 *
 * A value holding a `@` is left alone, and that is the whole exception: `.tone=@da` and
 * `id="@data.` are expressions being completed, where the list is right and belongs to
 * TypeScript. What closes it is a value with no `@` anywhere in it — `0`, `12`, `true`,
 * `"Hello` — which is a scalar literal (decision 105) that no name in scope can continue.
 */
const closesTheList = (at: CaretAt | undefined): boolean => {
  if (at === undefined) return false;

  const written = WRITTEN_VALUE.exec(at.text.slice(0, at.offset))?.[1];
  return written !== undefined && !written.includes('@');
};

/**
 * Watch the caret: open the value list where it lands on an empty prop value, close it once
 * the value is written.
 *
 * Both on the NEXT macrotask, for the reason `auto-close.ts` documents at length: this listener
 * runs inside the editor's own handling of the move, and a suggest asked for from there is
 * asked before the move has finished — VS Code is still leaving the previous tabstop, and it
 * dismisses the list on its way out. A timer of zero puts the request after that, which is
 * where a keystroke's own quick suggestion would have landed anyway. The close is deferred for
 * the same reason from the other end: the request the previous keystroke left in flight
 * resolves after this listener, and hiding before it lands would let it put the widget back.
 */
export function watchEmptyValues(caret: CaretPort): void {
  caret.onMoved((at) => {
    if (opensAValue(at)) {
      setTimeout(() => caret.triggerSuggest(), 0);
      return;
    }
    if (closesTheList(at)) setTimeout(() => caret.hideSuggest(), 0);
  });
}
