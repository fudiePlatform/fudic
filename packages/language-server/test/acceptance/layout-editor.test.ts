/**
 * The editor inside a layout whose body wraps its route in a component (SDD-48), over a real
 * LSP round trip.
 *
 * What a `@` offers there, what the parentheses of a hole offer, and that a snippet's root may
 * name a slot of a component its file cannot see.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  CodeActionRequest,
  CompletionRequest,
  CompletionTriggerKind,
  DocumentDiagnosticRequest,
  type CompletionItem,
  type CompletionList,
} from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;
let version = 1;

const APP_FRAME = `<app-frame>
  <template shadowrootmode="open">
    <header><slot name="top"></slot></header>
    <main><slot name="content"></slot></main>
    <footer><slot name="bottom"></slot></footer>
  </template>
</app-frame>
`;

const SNIPPETS = `@snippet foot(text: string) {
  <p slot="bottom">@text</p>
}
`;

/** A layout; `BODY` is replaced with what each test writes inside `<app-frame>`. */
const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <link rel="component" href="../components/app-frame.fud">
    <link rel="snippet" href="../snippets/frame.fud">
    @code {
      const { title = "x" } = props<{ title?: string }>();
    }
    @RenderHead()
  </head>
  <body>
    <app-frame>
BODY
    </app-frame>
  </body>
</html>
`;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/components/app-frame.fud`, APP_FRAME, 'utf8');
  mkdirSync(`${root}/snippets`, { recursive: true });
  writeFileSync(`${root}/snippets/frame.fud`, SNIPPETS, 'utf8');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

async function completeAt(relative: string, marked: string, trigger?: string): Promise<CompletionItem[]> {
  const { text, position } = harness.cursor(marked);
  const { uri } = await harness.open(relative, text);
  await harness.change(uri, text, ++version);
  const context =
    trigger === undefined
      ? {}
      : { context: { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: trigger } };
  const answer = (await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position,
    ...context,
  })) as
    | CompletionList
    | CompletionItem[]
    | null;
  if (answer === null) return [];
  return Array.isArray(answer) ? answer : answer.items;
}

const inLayout = (body: string, trigger?: string): Promise<CompletionItem[]> =>
  completeAt('layouts/_frame.fud', LAYOUT.replace('BODY', body), trigger);
const labels = (items: readonly CompletionItem[]): string[] => items.map((i) => i.label);

describe('a `@` in the body of a layout', () => {
  it('offers the holes, the snippets, the props and the control flow — and no `data`', async () => {
    const got = labels(await inLayout('      @RenderBody()\n      @|'));

    expect(got).toEqual(expect.arrayContaining(['@RenderBody', '@RenderSection', '@render', '@title', '@if']));
    expect(got).not.toContain('@data');
    expect(got).not.toContain('@()');
  });

  it('after `@render ` offers the snippets the layout links', async () => {
    const got = labels(await inLayout('      @RenderBody()\n      @render |'));

    expect(got).toEqual(['foot']);
  });

  it('still offers the holes while the `@RenderBody()` is being rewritten', async () => {
    // With the body's hole gone the file used to structure as a PAGE: `data` and `@()` in, the
    // holes out. Any hole left keeps it a layout — this one keeps its `@RenderHead()`.
    const got = labels(await inLayout('      @|'));

    expect(got).toContain('@RenderBody');
    expect(got).not.toContain('@data');
  });
});

describe('inside the parentheses of a hole', () => {
  it('`@RenderBody(|)` offers each slot of the component around it', async () => {
    const got = labels(await inLayout('      @RenderBody(|)'));

    expect(got).toEqual(['slot: "top"', 'slot: "content"', 'slot: "bottom"']);
  });

  it('`@RenderSection(nav, |)` offers `required: true` and the slots', async () => {
    const got = labels(await inLayout('      @RenderSection(nav, |)\n      @RenderBody()'));

    expect(got).toEqual(['required: true', 'slot: "top"', 'slot: "content"', 'slot: "bottom"']);
  });

  it('leaves out what is already written', async () => {
    const got = labels(await inLayout('      @RenderSection(nav, slot: "top", |)\n      @RenderBody()'));

    expect(got).toEqual(['required: true']);
  });

  it('inside `slot: "|"` offers the bare slot names', async () => {
    const got = labels(await inLayout('      @RenderBody(slot: "|")'));

    expect(got).toEqual(['top', 'content', 'bottom']);
  });

  it('opens by itself on `(` and on `,`, with no space typed', async () => {
    expect(labels(await inLayout('      @RenderBody(|)', '('))).toContain('slot: "top"');
    expect(labels(await inLayout('      @RenderSection(nav,|)\n      @RenderBody()', ','))).toContain('required: true');
  });

  it('filters the keys by the word being typed, never offering a tag', async () => {
    const got = labels(await inLayout('      @RenderSection(nav,required:true,sl|)\n      @RenderBody()'));

    expect(got).toEqual(['slot: "top"', 'slot: "content"', 'slot: "bottom"']);
  });

  it('after `slot:` offers each slot as a quoted value, and after `required:` the two booleans', async () => {
    expect(labels(await inLayout('      @RenderBody(slot:|)', ':'))).toEqual(['"top"', '"content"', '"bottom"']);
    expect(labels(await inLayout('      @RenderSection(nav, required: |)\n      @RenderBody()'))).toEqual([
      'true',
      'false',
    ]);
  });

  it('a `,` or a `(` anywhere else opens nothing', async () => {
    expect(await inLayout('      <p>uno,|</p>\n      @RenderBody()', ',')).toEqual([]);
    expect(await inLayout('      <p>(|</p>\n      @RenderBody()', '(')).toEqual([]);
  });

  it('says nothing on the name of a section', async () => {
    const got = await inLayout('      @RenderSection(na|)\n      @RenderBody()');

    expect(labels(got)).not.toContain('required: true');
  });
});

describe('the arguments of a `@render`', () => {
  it('offers the values of this view behind their `@`, and the parameters by name', async () => {
    const got = labels(await inLayout('      @RenderBody()\n      @render foot(|)', '('));

    expect(got).toEqual(['@title', 'text:']);
  });

  it('after a `name:` offers only values', async () => {
    const got = labels(await inLayout('      @RenderBody()\n      @render foot(text: |)'));

    expect(got).toEqual(['@title']);
  });

  it('a reference with no `@` is FUD0894, and the bulb writes it', async () => {
    const text = LAYOUT.replace('BODY', '      @RenderBody()\n      @render foot(title)');
    const { uri } = await harness.open('layouts/_frame.fud', text);
    await harness.change(uri, text, ++version);
    const got = await harness.client.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } });
    const items = (got as { items?: { code?: unknown; range: unknown }[] }).items ?? [];
    const diagnostic = items.find((d) => d.code === 'FUD0894')!;
    const actions = (await harness.client.sendRequest(CodeActionRequest.type, {
      textDocument: { uri },
      range: diagnostic.range as never,
      context: { diagnostics: [diagnostic] as never },
    })) as readonly { title: string; edit?: { changes?: Record<string, { newText: string }[]> } }[];
    const fix = actions.find((a) => a.title === 'Escribir @title');

    expect(Object.values(fix?.edit?.changes ?? {})[0]?.map((e) => e.newText)).toEqual(['@title']);
  });
});

describe('a snippet file', () => {
  it('lets a root of a body name a slot: its component is the caller’s', async () => {
    const { uri } = await harness.open('snippets/frame.fud', SNIPPETS);
    const got = await harness.client.sendRequest(DocumentDiagnosticRequest.type, { textDocument: { uri } });
    const items = (got as { items?: { code?: unknown }[] }).items ?? [];

    expect(items.map((d) => String(d.code))).not.toContain('2345');
  });
});
