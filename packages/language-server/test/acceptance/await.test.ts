/**
 * SDD-70 criteria 3, 24 and 25 — `@await` in the editor, over the live connection.
 *
 * A route whose `.fudapi` marks `users` and `stats` as `later` and leaves `title` resolved: `@`
 * offers `@await`, and accepting it reopens the list; after `@await data.` the list is the two
 * `later` fields with their types and nothing else; `@catch` right after the `}` of an `@await`
 * that has none. Nowhere else.
 *
 * Its own workspace: the contracts written here would change what every other suite sees.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  CompletionItemKind,
  CompletionRequest,
  HoverRequest,
  type CompletionItem,
  type CompletionList,
  type Hover,
} from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const ESPERA = 'src/routes/espera.fud';
const PLAIN = 'src/routes/plain.fud';
const WAITER = 'src/components/x-waiter.fud';
const OTHER_LAYOUT = 'src/layouts/_other.fud';

const API = `load
  title  str
  users  Person[]  later
  stats  Stats  later

type Person
  id  i32
  name  str

type Stats
  visits  i32
`;

const LINKS = '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./espera.fudapi">\n';

/** The route with `body` in its `<article>` and `head` in its `<head>`. */
const espera = (body: string, head = '<title>t</title>'): string =>
  `${LINKS}\n<head>\n  ${head}\n</head>\n\n<article>\n  ${body}\n</article>\n`;

let harness: Harness;
let version = 1;

beforeAll(async () => {
  const root = copyWorkspace();
  mkdirSync(`${root}/src/routes`, { recursive: true });
  writeFileSync(`${root}/src/routes/espera.fudapi`, API, 'utf8');
  writeFileSync(`${root}/${ESPERA}`, espera('<p>@data.title</p>'), 'utf8');
  writeFileSync(`${root}/src/routes/plain.fudapi`, 'load\n  title  str\n', 'utf8');
  writeFileSync(`${root}/${PLAIN}`, '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./plain.fudapi">\n<article></article>\n', 'utf8');
  writeFileSync(
    `${root}/${WAITER}`,
    '<link rel="server" href="../routes/espera.fudapi">\n<x-waiter>\n  <template shadowrootmode="open"></template>\n</x-waiter>\n',
    'utf8',
  );
  writeFileSync(
    `${root}/${OTHER_LAYOUT}`,
    '<!DOCTYPE html>\n<html>\n  <head>\n    @RenderHead()\n  </head>\n  <body>\n    <main>@RenderBody()</main>\n  </body>\n</html>\n',
    'utf8',
  );
  harness = await startHarness({ root });
  await harness.open(ESPERA);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** Rewrite a file with the cursor at `|` and ask for completion there. */
async function completeAt(relative: string, marked: string): Promise<CompletionItem[]> {
  const { uri } = await harness.open(relative);
  const { text, position } = harness.cursor(marked);
  await harness.change(uri, text, ++version);
  const answer = (await harness.client.sendRequest(CompletionRequest.type, { textDocument: { uri }, position })) as
    | CompletionList
    | CompletionItem[]
    | null;
  if (answer === null) return [];
  return Array.isArray(answer) ? answer : answer.items;
}

const labels = (items: readonly CompletionItem[]): string[] => items.map((item) => item.label);
const item = (items: readonly CompletionItem[], label: string): CompletionItem | undefined => items.find((i) => i.label === label);

describe('criterion 24 — `@await` is offered where a page waits', () => {
  it('a `@` in the body of a route with later fields offers it, and accepting it reopens the list', async () => {
    const items = await completeAt(ESPERA, espera('@|'));
    const offered = item(items, '@await');

    expect(offered?.textEdit?.newText).toBe('await data.$1 {\n  $0\n}');
    expect(offered?.insertTextFormat).toBe(2);
    // §8.2.7: the door of TypeScript's reply carries the command too.
    expect(offered?.command?.command).toBe('editor.action.triggerSuggest');
  });

  it('after `@await data.` the list is the later fields, with their types, and nothing else', async () => {
    const items = await completeAt(ESPERA, espera('@await data.| {\n  }'));

    expect(labels(items)).toEqual(['users', 'stats']);
    expect(items.map((i) => [i.kind, i.detail])).toEqual([
      [CompletionItemKind.Field, 'Person[]'],
      [CompletionItemKind.Field, 'Stats'],
    ]);
  });

  it('a name begun after the dot is what the item replaces', async () => {
    const marked = espera('@await data.us| {\n  }');
    const items = await completeAt(ESPERA, marked);
    const users = item(items, 'users');
    const { position } = harness.cursor(marked);

    expect(labels(items)).toEqual(['users', 'stats']);
    expect(users?.textEdit).toEqual({ range: { start: { ...position, character: position.character - 2 }, end: position }, newText: 'users' });
  });

  it('not in the `<head>`', async () => {
    expect(labels(await completeAt(ESPERA, espera('<p>x</p>', '<title>t</title>\n  @|')))).not.toContain('@await');
  });

  it('not in a component linking the same contract, nor in a layout', async () => {
    const component = await completeAt(WAITER, '<link rel="server" href="../routes/espera.fudapi">\n<x-waiter>\n  <template shadowrootmode="open">@|</template>\n</x-waiter>\n');
    expect(labels(component)).toContain('@if');
    expect(labels(component)).not.toContain('@await');

    // A layout links no `.fudapi` (FUD1112): it is its role that keeps `@await` out, which the
    // unit suite measures with a contract that has later fields.
    const layout = await completeAt(
      OTHER_LAYOUT,
      '<!DOCTYPE html>\n<html>\n  <head>\n    @RenderHead()\n  </head>\n  <body>\n    @|\n    <main>@RenderBody()</main>\n  </body>\n</html>\n',
    );
    expect(labels(layout)).toContain('@if');
    expect(labels(layout)).not.toContain('@await');
  });

  it('not in a route whose contract has no later field', async () => {
    const items = await completeAt(PLAIN, '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./plain.fudapi">\n<article>\n  @|\n</article>\n');
    expect(labels(items)).toContain('@if');
    expect(labels(items)).not.toContain('@await');
  });
});

describe('criterion 25 — `@catch` right after the `}` of an `@await` without one', () => {
  it('is offered there', async () => {
    const offered = item(await completeAt(ESPERA, espera('@await data.users {\n    <p>x</p>\n  } @|')), '@catch');
    expect(offered?.textEdit?.newText).toBe('catch (${1:e}) {\n  $0\n}');
  });

  it('not after one that has it', async () => {
    const items = await completeAt(ESPERA, espera('@await data.users {\n  } @catch (e) {\n  } @|'));
    expect(labels(items)).not.toContain('@catch');
  });

  it('not after an `@if`, nor with something written between', async () => {
    expect(labels(await completeAt(ESPERA, espera('@if (data.title) {\n  } @|')))).not.toContain('@catch');
    expect(labels(await completeAt(ESPERA, espera('@await data.users {\n  } <p>y</p> @|')))).not.toContain('@catch');
  });
});

describe('criterion 3 — the types inside, over the live connection', () => {
  async function hoverAt(body: string, needle: string, delta: number): Promise<string> {
    const text = espera(body);
    const { uri } = await harness.open(ESPERA);
    await harness.change(uri, text, ++version);
    const hover = (await harness.client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: harness.positionAt(text, text.indexOf(needle) + delta),
    })) as Hover | null;
    const contents = hover?.contents;
    return typeof contents === 'object' && contents !== null && 'value' in contents ? String(contents.value) : '';
  }

  const BODY = '@await data.users {\n    <p>@data.users.length</p>\n  } @catch (e) {\n    <p>@e.status</p>\n  }';

  it('the field read inside the body is the resolved list', async () => {
    expect(await hoverAt(BODY, 'users.length', 1)).toContain('users: readonly Person[]');
  });

  it('the name of the catch is a Problem', async () => {
    expect(await hoverAt(BODY, '@e.status', 1)).toContain('e: $Problem');
  });
});
