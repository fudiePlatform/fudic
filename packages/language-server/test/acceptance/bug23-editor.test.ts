/**
 * BUG-23 — the two positions of the editor, on the file Pedro actually types.
 *
 * The suite already measured both, on a COMPONENT tag and inside a `<div>`, and both were
 * green while VS Code answered with one item. So this file reproduces the page of the report
 * character for character — a native `<div>`, a `<head>` with a `<style>`, a `@server` and a
 * `@client` — and asserts the two lists a developer sees.
 */

import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  type CompletionItem,
  type CompletionList,
} from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const HEAD = `<link rel="layout" href="../layouts/_layout.fud">
@code {
  type PageData = { title: string };

  @server {
    export async function load(): Promise<PageData> {
      return { title: "Untitled" };
    }
  }

  @client {
    const { title } = data;
    function handlerClick() {}
  }
}

<head>
  <title>@data.title</title>
  <style>
    .red {
      color: red;
    }
  </style>
</head>

<h1>@data.title</h1>

`;

const PAGE = 'blog/xxx.fud';
const page = (markup: string): string => `${HEAD}${markup}\n`;

let harness: Harness;
let version = 1;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/${PAGE}`, page('<div></div>'));
  harness = await startHarness({ root });
  await harness.open(PAGE);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/**
 * Ask for completion the way the editor asks.
 *
 * `triggerCharacter` ONLY for a character the server registered. Volar skips every plugin
 * whose declared trigger characters do not include the one sent, so a request carrying `'r'`
 * runs nothing at all and comes back empty — which reads exactly like "the server correctly
 * offers nothing here" and is in fact "the server was never asked". Typing an ordinary letter
 * is `triggerKind: 1`, Invoked, with no character, and that is what these must send.
 */
async function completeAt(
  markup: string,
  triggerCharacter?: string,
): Promise<CompletionItem[]> {
  const text = page(markup.replace('|', ''));
  const at = HEAD.length + markup.indexOf('|');
  const { uri } = await harness.open(PAGE);
  await harness.change(uri, text, ++version);

  const answer = (await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, at),
    context:
      triggerCharacter === undefined
        ? { triggerKind: 1 }
        : { triggerKind: 2, triggerCharacter },
  })) as CompletionList | CompletionItem[] | null;

  if (answer === null) return [];
  return Array.isArray(answer) ? answer : answer.items;
}

const names = (items: CompletionItem[]): string[] => items.map((item) => item.label);

/** How many times a label appears. `toContain` is blind to this, and that is what hid it. */
const count = (items: CompletionItem[], label: string): number =>
  names(items).filter((name) => name === label).length;

describe('the list the editor actually renders', () => {
  it('offers each name ONCE after a letter is typed in text', async () => {
    const items = await completeAt('@t|', '@');
    console.log('=== @t ===', JSON.stringify(names(items)));

    // Labelled with the `@` that reaches the name, which is how it is written in a `.fud`.
    expect(count(items, '@title')).toBe(1);
  });

  it('offers each handler ONCE after a letter is typed in an event', async () => {
    const items = await completeAt('<app-circle .name=@data.title @click=@h|></app-circle>', '@');
    console.log('=== @click=@h ===', JSON.stringify(names(items)));

    expect(count(items, '@handlerClick')).toBe(1);
  });

  /**
   * The assertion that would have caught the whole thing, and did not exist.
   *
   * An item with no replacement range is one the EDITOR ranges, with its own idea of where
   * the word under the caret begins — and in a `.fud` that idea swallows the `@`, so it
   * filters `handlerClick` against `@h` and shows nothing. Every item was on the wire and
   * correct; the list was empty on screen. Nothing about the labels can detect that, which
   * is why every `toContain` in this file passed while the editor was blank.
   */
  it.each([
    ['@t|', 'text'],
    ['<app-circle .name=@data.title @click=@h|></app-circle>', 'an event'],
    ['<app-circle .name=@t|></app-circle>', 'a prop'],
  ])('gives every item its own replacement range in %s (%s)', async (markup) => {
    const items = await completeAt(markup, '@');
    const homeless = items.filter((item) => item.textEdit === undefined).map((i) => i.label);

    expect(items.length).toBeGreaterThan(0);
    expect(homeless).toEqual([]);
  });

  it('offers the template’s own names in a prop value before the `@` is pressed', async () => {
    // It used to answer NOTHING, on the rule that until the `@` is there the author has said
    // nothing to complete. The rule described the grammar and served the developer badly: the
    // `@` is precisely what an editor is for, so the names arrive with it already written.
    const items = await completeAt('<app-circle .name=r|></app-circle>');

    expect(names(items)).toContain('@title');
    // What the silence did fix stays fixed: never HTML's vocabulary, which is what reached
    // this position when nobody owned it.
    expect(names(items)).not.toContain('role');
    expect(names(items)).not.toContain('hidden');
  });

  it('offers only what can be called in an event value before the `@` is pressed', async () => {
    const items = await completeAt('<app-circle .name="x" @click=j|></app-circle>');

    expect(names(items)).toContain('@handlerClick');
    // A listener is what goes there, so a value that cannot be one is not offered — and never
    // TypeScript's whole global scope, which is what answered with `JSON`.
    expect(names(items)).not.toContain('@title');
    expect(names(items)).not.toContain('JSON');
  });

  it('writes the `@` itself, since the author has not typed one', async () => {
    // `.name=data` is a literal that happens to spell a variable's name; `.name=@data` is the
    // read they meant. The `@` is in the inserted text and not in the range, which is what
    // makes the difference invisible to the developer and exact in the file.
    const items = await completeAt('<app-circle .name=|></app-circle>');
    const title = items.find((item) => item.label === '@title');

    expect((title?.textEdit as { newText: string } | undefined)?.newText).toBe('@title');
    expect(title?.filterText).toBe('title');
  });
});

describe('the `@` after a `=` on a NATIVE element', () => {
  it('offers the handlers of `@client`, and the escape hatch', async () => {
    const items = await completeAt('<div @click=@|></div>', '@');

    expect(names(items)).toContain('@()');
    expect(names(items)).toContain('@handlerClick');
  });

  it('and not a name that cannot be a listener', async () => {
    const items = await completeAt('<div @click=@|></div>', '@');

    expect(names(items)).not.toContain('@title');
  });
});

describe('the `@` in a text region', () => {
  it('offers the snippets, the escape hatch and everything in scope', async () => {
    const items = await completeAt('@|', '@');

    expect(names(items)).toContain('@foreach');
    expect(names(items)).toContain('@()');
    expect(names(items)).toContain('@data');
    expect(names(items)).toContain('@title');
    expect(names(items)).toContain('@handlerClick');
  });

  it('offers the same list on a plain Ctrl+Space, with no `@` typed', async () => {
    // The developer who does not yet know that a `@` is how fudic reaches its data cannot ask
    // for the list by typing the one character they are missing. Here the items bring it.
    const items = await completeAt('|');

    expect(names(items)).toContain('@foreach');
    expect(names(items)).toContain('@data');
  });
});

/**
 * The same two lists with NO TypeScript behind them at all.
 *
 * This is the shape of the report, and the reason the suite could be green while VS Code
 * showed one item: every list at these positions was TypeScript's, narrowed by a filter, so
 * anything that silenced TypeScript in a real project — a program still loading, a `tsconfig`
 * that does not reach the file, a `.d.ts` from another version — emptied the list and left
 * only what the server synthesized on top. `@()` alone after a `=`, the snippets alone in
 * text: exactly the two screenshots.
 *
 * `origin: 'none'` is the harshest version of that, and the cheapest to reproduce: §6.1's
 * degraded mode, where no TypeScript service is mounted at all. The names come from the parse,
 * so they must survive it — and if they do, they survive every milder way of losing
 * TypeScript too.
 */
describe('with no TypeScript at all, which is what a broken project looks like', () => {
  let degraded: Harness;
  let degradedVersion = 1;

  beforeAll(async () => {
    const root = copyWorkspace();
    writeFileSync(`${root}/${PAGE}`, page('<div></div>'));
    degraded = await startHarness({
      root,
      overrides: { loadTypeScript: () => ({ origin: 'none' }) },
    });
    await degraded.open(PAGE);
  }, 60_000);

  afterAll(async () => {
    await degraded.stop();
  });

  async function completeDegradedAt(markup: string): Promise<CompletionItem[]> {
    const text = page(markup.replace('|', ''));
    const at = HEAD.length + markup.indexOf('|');
    const { uri } = await degraded.open(PAGE);
    await degraded.change(uri, text, ++degradedVersion);

    const answer = (await degraded.client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: degraded.positionAt(text, at),
      context: { triggerKind: 2, triggerCharacter: '@' },
    })) as CompletionList | CompletionItem[] | null;

    if (answer === null) return [];
    return Array.isArray(answer) ? answer : answer.items;
  }

  it('still offers the handlers after a `=@`', async () => {
    const items = await completeDegradedAt('<div @click=@|></div>');

    expect(names(items)).toContain('@handlerClick');
    expect(names(items)).toContain('@()');
  });

  it('still offers the constructs, the scope and the escape hatch in text', async () => {
    const items = await completeDegradedAt('@|');

    expect(names(items)).toContain('@foreach');
    expect(names(items)).toContain('@()');
    expect(names(items)).toContain('@data');
    expect(names(items)).toContain('@handlerClick');
  });
});
