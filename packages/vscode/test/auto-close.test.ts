/**
 * BUG-22 §1 — the `>` that closes a tag.
 *
 * The rule itself lives in the compiler and is tested there; what is tested here is the wire:
 * which keystrokes are worth a round trip, and what happens when the answer is nothing or the
 * server is not there at all.
 */

import { describe, expect, it } from 'vitest';
import { AUTO_CLOSE_TAG_REQUEST, watchTypedTags } from '../src/auto-close.js';
import type { LanguageClientPort, SnippetTarget, TypedText, TypingPort } from '../src/ports.js';

interface Harness {
  readonly typing: TypingPort;
  /** Simulate one edit reaching the listener. */
  type(typed: TypedText | undefined): void;
  readonly requests: { method: string; params: unknown }[];
  readonly inserted: SnippetTarget[];
}

/**
 * A client wired to a listener, with `answer` as whatever the server would say.
 *
 * A thunk rather than a promise for the failing case: the request leaves on the macrotask
 * after the keystroke, so a promise rejected at construction time would sit unhandled for a
 * turn of the loop and be reported as an unhandled rejection by the runner.
 */
function harness(answer: string | (() => Promise<string>)): Harness {
  const requests: { method: string; params: unknown }[] = [];
  const inserted: SnippetTarget[] = [];
  let listener: (typed: TypedText | undefined) => void = () => undefined;

  const typing: TypingPort = {
    onTyped: (handler) => {
      listener = handler;
    },
    insert: async (target) => {
      inserted.push(target);
    },
  };

  const client = {
    sendRequest: async (method: string, params: unknown) => {
      requests.push({ method, params });
      return typeof answer === 'string' ? answer : await answer();
    },
  } as unknown as LanguageClientPort;

  watchTypedTags(typing, { client });
  return { typing, type: (typed) => listener(typed), requests, inserted };
}

/** A `>` typed at offset 11 of an open `.fud`. */
const TYPED: TypedText = { uri: 'file:///x.fud', offset: 11, text: '>', version: 4 };

/** Let the request's promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('watchTypedTags', () => {
  it('asks the server what the `>` is asking for, and inserts it', async () => {
    const h = harness('</div>');
    h.type(TYPED);
    await settle();

    expect(h.requests).toEqual([
      { method: AUTO_CLOSE_TAG_REQUEST, params: { uri: 'file:///x.fud', offset: 11 } },
    ]);
    expect(h.inserted).toEqual([{ ...TYPED, text: '</div>' }]);
  });

  it('inserts nothing when the server says there is nothing to close', async () => {
    const h = harness('');
    h.type(TYPED);
    await settle();

    expect(h.inserted).toEqual([]);
  });

  it('says nothing about any other character: one round trip per keystroke is one too many', async () => {
    const h = harness('</div>');
    h.type({ ...TYPED, text: 'v' });
    h.type({ ...TYPED, text: '<div>' });
    await settle();

    expect(h.requests).toEqual([]);
  });

  it('ignores a change that is not an edit of a .fud', async () => {
    const h = harness('</div>');
    h.type(undefined);
    await settle();

    expect(h.requests).toEqual([]);
  });

  it('stays quiet when the server is not there', async () => {
    // On every keystroke: a server that is restarting would otherwise raise one modal per
    // character, for a feature whose worst failure is that the user types six of them.
    const h = harness(() => Promise.reject(new Error('server is restarting')));
    h.type(TYPED);
    await settle();

    expect(h.inserted).toEqual([]);
  });

  it('does not ask in the same turn as the keystroke: the didChange goes first', () => {
    // This listener and the language client's listen to the same editor event and this one
    // runs first; the client sends its `didChange` from a promise chain. Asking straight away
    // put the request on the wire ahead of the `>` that caused it, so the server answered
    // about a document it had not been told about — and answered nothing, every time.
    const h = harness('</div>');
    h.type(TYPED);

    expect(h.requests).toEqual([]);
  });
});
