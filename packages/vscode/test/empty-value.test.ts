/**
 * BUG-23 task 25 — the list that opens on the prop value a Tab has just landed on.
 *
 * Expanding a tag writes a tabstop per required prop, and arriving at one is not a keystroke,
 * so the editor's own quick suggestions never fire there. What is tested here is the wire and
 * its guard: which caret positions are worth a list, and — the half that matters — which are
 * not, because a list opened over a value the author is already writing is a list that eats
 * the next Tab.
 */

import { describe, expect, it } from 'vitest';
import { watchEmptyValues } from '../src/empty-value.js';
import type { CaretAt, CaretPort } from '../src/ports.js';

interface Harness {
  /** Simulate one caret move reaching the listener. */
  move(at: CaretAt | undefined): void;
  /** What the watcher did, in order: `open` or `close`. */
  readonly did: string[];
}

function harness(): Harness {
  let listener: (at: CaretAt | undefined) => void = () => undefined;
  const did: string[] = [];

  const caret: CaretPort = {
    onMoved: (handler) => {
      listener = handler;
    },
    triggerSuggest: () => did.push('open'),
    hideSuggest: () => did.push('close'),
  };

  watchEmptyValues(caret);
  return { move: (at) => listener(at), did };
}

/** The caret placed at `|` in `marked`. */
const caretAt = (marked: string): CaretAt => ({
  text: marked.replace('|', ''),
  offset: marked.indexOf('|'),
});

/** The request leaves on the macrotask after the move; let it land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** What the watcher does at the caret marked `|`. */
async function whatHappensAt(marked: string): Promise<string[]> {
  const wire = harness();
  wire.move(caretAt(marked));
  await settle();
  return wire.did;
}

describe('watchEmptyValues', () => {
  it('opens the list on an empty prop value, whatever follows the tag', async () => {
    for (const marked of [
      '<app-input .id=| .name=></app-input>',
      '<app-input .id=|>',
      '<app-input .id=|/>',
      '<app-input .id=|',
    ]) {
      expect(await whatHappensAt(marked)).toEqual(['open']);
    }
  });

  it('CLOSES it the moment a scalar literal is typed', async () => {
    // The half the server cannot do. Its answer at `.id=0` is already nothing, but the list
    // was opened by command — an explicit invocation — and VS Code keeps one of those up
    // rendering «No suggestions» however empty the reply is. A widget that is only open
    // because we opened it is a widget we have to close: otherwise reaching `.name` costs an
    // Esc, or two Tabs, one to dismiss and one to move (BUG-23 task 25).
    for (const marked of [
      '<app-input .id=0| .name=></app-input>',
      '<app-input .id=12| .name=></app-input>',
      '<app-input .name=tru|></app-input>',
      '<app-input .name="Hello|"></app-input>',
      '<app-input @click=onC|></app-input>',
    ]) {
      expect(await whatHappensAt(marked)).toEqual(['close']);
    }
  });

  it('leaves a value holding a `@` alone, which is an expression being completed', async () => {
    // There the list is right and it is TypeScript's: `@da` is half a name in scope, and the
    // quoted form is the same question with quotes around it.
    for (const marked of [
      '<app-input .id=@|></app-input>',
      '<app-input .id=@it|></app-input>',
      '<app-input .name="@data.|"></app-input>',
      '<app-input @click=@on|></app-input>',
    ]) {
      expect(await whatHappensAt(marked)).toEqual([]);
    }
  });

  it('does nothing where a value is not what comes next', async () => {
    // An attribute is not a prop — the dot is what tells them apart — and a caret that is not
    // right after the `=` is not on a value at all. A value does not cross a blank either, so
    // the caret after `.name= ` is on no value.
    for (const marked of [
      '<app-input .id|= .name=></app-input>',
      '<app-input .id=></app-input>|',
      '<app-input .name= |></app-input>',
      '<div>|</div>',
    ]) {
      expect(await whatHappensAt(marked)).toEqual([]);
    }
  });

  it('does nothing when the move carried no caret at all', async () => {
    // A selection, several carets, or a document that is not a `.fud`: `caretAtOf` answers
    // `undefined` for all three, and there is nothing to open or close a list on.
    expect(await whatHappensAt('|')).toEqual([]);

    const wire = harness();
    wire.move(undefined);
    await settle();
    expect(wire.did).toEqual([]);
  });
});
