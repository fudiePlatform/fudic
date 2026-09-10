/**
 * BUG-23 — what TypeScript is allowed to say inside a `.fud`.
 *
 * The decorator is measured over a FAKE TypeScript plugin, and that is the point: what is
 * being tested is the narrowing, not tsserver. The acceptance suite drives the real one over
 * a real project; here the reply is written by hand so that the two silences this decorator
 * has to survive — a plugin that answers `undefined` and one that answers `null` — can be
 * produced at all.
 */

import { describe, expect, it } from 'vitest';
import type {
  CompletionItem,
  CompletionList,
  LanguageServicePlugin,
  LanguageServicePluginInstance,
} from '@volar/language-service';
import { CompletionItemKind } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type ts from 'typescript';
import { clientFileName, mapToGenerated } from '@fudic/language-core';
import { DocumentCache } from '../../src/document-cache.js';
import { filterTypeScriptCompletions } from '../../src/services/ts-completion.js';
import { CLIENT_CODE_ID, SERVER_CODE_ID } from '../../src/virtual-code.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import type { CachedDocument } from '../../src/document-cache.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { component, LAYOUT, memoryFs, projectionService } from '../_support.js';

const PATH = '/p/pages/index.fud';
const FUD_URI = URI.file(PATH);

/**
 * A page with two names in scope, one class of its own, and a `<p>` to put the cursor in.
 *
 * The `<style>` is not decoration: the classes of the file ride inside TypeScript's reply at a
 * gap — an additional plugin runs on the first mapping alone, and a gap maps into the
 * projection — so without one the gap answers with half of what it has to.
 */
const page = (markup: string): string =>
  `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">
@code {
  @client {
    const counter = 1;
    function onClick() {}
  }
}

<head>
  <style>
    .red { color: red }
  </style>
</head>
<article>
  <p>${markup}</p>
</article>
`;

/**
 * A LAYOUT holding `markup` in its `<main>`.
 *
 * It interpolates nothing — no `@code` (`FUD0437`), no `load`, so no `data` — which is what
 * makes it the one role where a name in scope is never an answer.
 */
const layout = (markup: string): string => LAYOUT.replace('@RenderBody()', `${markup}\n      @RenderBody()`);

/** The cached `.fud`, its client projection, and a document over the projection's text. */
function project(markup: string, build: (m: string) => string = page) {
  const source = build(markup);
  const index = new WorkspaceIndex(
    memoryFs({
      '/p/layouts/_layout.fud': LAYOUT,
      '/p/components/app-badge.fud': component('app-badge'),
      [PATH]: source,
    }),
  );
  index.scan('/p');
  const cached = new DocumentCache(index).get(PATH, 1, source);
  const client = cached.virtuals.find((v) => v.fileName === clientFileName(cached.path))!;

  return {
    source,
    cached,
    client,
    document: TextDocument.create(`file://${client.fileName}`, 'typescript', 1, client.text),
  };
}

/**
 * A TypeScript plugin whose reply is `answer`, wrapped by the decorator under test.
 *
 * `service` is what the TypeScript service publishes for whoever needs the program itself
 * (`ts-service.ts`). Absent by default — a server with no TypeScript mounted is the degraded
 * half every branch here has to survive — and a REAL one where the answer depends on a type.
 */
function wrap(
  answer: CompletionList | undefined | null,
  documents: Readonly<Record<string, CachedDocument>>,
  decode: (uri: URI) => [URI, string] | undefined,
  service?: ts.LanguageService,
): LanguageServicePluginInstance {
  const plugin: LanguageServicePlugin = {
    name: 'typescript-double',
    capabilities: { completionProvider: {} },
    create: () => ({
      provideCompletionItems: () => answer as CompletionList | undefined,
    }),
  };
  const [wrapped] = filterTypeScriptCompletions([plugin]);
  const provided = service === undefined ? {} : { 'typescript/languageService': service };
  return wrapped!.create(fakeServiceContext(documents, decode, provided));
}


const item = (label: string, extra: Partial<CompletionItem> = {}): CompletionItem => ({
  label,
  kind: CompletionItemKind.Variable,
  ...extra,
});

const list = (...items: CompletionItem[]): CompletionList => ({ isIncomplete: false, items });

/** The reply of the wrapped plugin at the `|` of `markup`, over `answer`. */
async function completeAt(
  markup: string,
  answer: CompletionList | undefined | null,
  options: {
    codeId?: string;
    virtuals?: readonly never[];
    /** The file the markup goes into. A page by default; `layout` for the role that reads nothing. */
    build?: (m: string) => string;
    /** Mount a real TypeScript over the projection, for the answers that depend on a type. */
    typescript?: boolean;
  } = {},
): Promise<CompletionList | undefined | null> {
  const build = options.build ?? page;
  const { cached, client, document } = project(markup.replace('|', ''), build);
  // The caret located in the BUILT file: the templates carry no `|` of their own, so the one
  // in the markup is the one found — and it works whatever the markup was wrapped in.
  const at = build(markup).indexOf('|');
  const generated = mapToGenerated(client, at, 'completion');
  const entry = options.virtuals === undefined ? cached : { ...cached, virtuals: options.virtuals };
  const service = wrap(
    answer,
    { [FUD_URI.toString()]: entry },
    () => [FUD_URI, options.codeId ?? CLIENT_CODE_ID],
    options.typescript === true ? projectionService(cached.path, client.text) : undefined,
  );

  return (await service.provideCompletionItems?.(
    document,
    document.positionAt(generated ?? 0),
    { triggerKind: 1 },
    TOKEN,
  )) as CompletionList | undefined | null;
}

describe('the positions this package does not own', () => {
  it('leaves a document that is not an embedded projection exactly as it was', async () => {
    // A real `.ts` of the workspace is none of this package's business — the `$` rule
    // included, since nothing there is scaffolding of ours.
    const document = TextDocument.create('file:///p/src/main.ts', 'typescript', 1, 'const a = 1;');
    const service = wrap(list(item('$tpl'), item('atob')), {}, () => undefined);

    const answer = await service.provideCompletionItems?.(
      document,
      { line: 0, character: 0 },
      { triggerKind: 1 },
      TOKEN,
    );

    expect(answer?.items.map((i) => i.label)).toEqual(['$tpl', 'atob']);
  });

  it('leaves an embedded document whose source is not a `.fud`', async () => {
    const document = TextDocument.create('file:///p/x.vue.ts', 'typescript', 1, '');
    const service = wrap(list(item('$tpl')), {}, () => [URI.file('/p/x.vue'), CLIENT_CODE_ID]);

    const answer = await service.provideCompletionItems?.(
      document,
      { line: 0, character: 0 },
      { triggerKind: 1 },
      TOKEN,
    );

    expect(answer?.items.map((i) => i.label)).toEqual(['$tpl']);
  });

  it('leaves a `.fud` the language does not hold a script for', async () => {
    const document = TextDocument.create('file:///p/pages/index.fud.client.ts', 'typescript', 1, '');
    const service = wrap(list(item('$tpl')), {}, () => [FUD_URI, CLIENT_CODE_ID]);

    const answer = await service.provideCompletionItems?.(
      document,
      { line: 0, character: 0 },
      { triggerKind: 1 },
      TOKEN,
    );

    expect(answer?.items.map((i) => i.label)).toEqual(['$tpl']);
  });

  it('drops the scaffolding in the SERVER projection, and narrows nothing else', async () => {
    // `@code` and nothing else: a position there is ordinary TypeScript, so the whole scope
    // is the right answer — but `$props` and `$on` are still names nobody may write.
    const answer = await completeAt('@|', list(item('$props'), item('atob')), {
      codeId: SERVER_CODE_ID,
    });

    expect(answer?.items.map((i) => i.label)).toEqual(['atob']);
  });

  it('drops the scaffolding when the client projection is missing from the batch', async () => {
    const answer = await completeAt('@|', list(item('$tpl'), item('atob')), { virtuals: [] });

    expect(answer?.items.map((i) => i.label)).toEqual(['atob']);
  });
});

describe('a `@` in markup, when TypeScript says nothing at all', () => {
  it('answers with the template’s own names over an `undefined` reply', async () => {
    // A program that has not finished loading answers `undefined` at every offset. The names
    // come from the parse, so they are the answer whether or not TypeScript ever arrives.
    const answer = await completeAt('@|', undefined);

    // Labelled WITH the `@`, because that is how a name is read in fudic: `@data.title`,
    // `@click=@fn`. A list that spells them bare teaches that `data` is written `data`, which
    // it never is — see `reading`.
    expect(answer?.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['@counter', '@onClick', '@()', '@if']),
    );
    // An incomplete list, so the editor asks again once the program is up.
    expect(answer?.isIncomplete).toBe(true);
  });

  it('and over a `null` one, which is the other way a service declines', async () => {
    const answer = await completeAt('@|', null);

    expect(answer?.items.map((i) => i.label)).toEqual(expect.arrayContaining(['@counter', '@()']));
  });

  it('gives the silence back untouched where it owns nothing', async () => {
    // Plain text: no rule of this decorator fires, so a `null` stays `null` and the position
    // travels on to whoever else may have an answer.
    expect(await completeAt('hola|', null)).toBeNull();
    expect(await completeAt('hola|', undefined)).toBeUndefined();
  });
});

describe('the two rules over a reply that does arrive', () => {
  it('keeps what the template can see and drops what it cannot', async () => {
    const answer = await completeAt(
      '@|',
      list(item('counter'), item('atob'), item('$tpl'), item('AbortController')),
    );

    expect(answer?.items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['@counter', '@onClick', '@()']),
    );
    expect(answer?.items.map((i) => i.label)).not.toContain('@atob');
    expect(answer?.items.map((i) => i.label)).not.toContain('@$tpl');
  });

  it('keeps the bare name as what the editor FILTERS against', async () => {
    // The editor matches an item against the text between the start of its replacement range
    // and the caret, and that range begins AFTER the `@` the author already typed. With the
    // `@` inside the matched text every one of these items would be dropped before reaching
    // the list — the label is for reading, the filter is for matching.
    const answer = await completeAt('@c|', list(item('counter')));
    const counter = answer?.items.find((i) => i.label === '@counter');

    expect(counter?.filterText).toBe('counter');
  });

  it('writes the bare name too, so accepting one after a `@` never doubles it', async () => {
    // `anchored` falls back to the LABEL for an item that carries no edit of its own, and the
    // label now opens with the `@` the author has already typed: without an insert text of its
    // own, accepting `@fn` after `@click=@` wrote `@@fn` — the escape of decision 1, and a
    // `FUD0056` on the value.
    const answer = await completeAt('@c|', list(item('counter')));
    const counter = answer?.items.find((i) => i.label === '@counter');

    expect(counter?.insertText).toBe('counter');
  });

  it('drops an auto-import even when its label is a name in scope', async () => {
    // Both marks the protocol carries before the item is resolved: the module shown on the
    // right of the list, and the source the resolve step would import from. Either one is
    // proof the name does not exist at this position yet.
    const answer = await completeAt(
      '@|',
      list(
        item('counter', { labelDetails: { description: '../../vite.config' } }),
        item('onClick', { data: { source: '@fudic/transport' } }),
      ),
    );

    // Offered all the same, but as the names of the template rather than as imports: no
    // `labelDetails`, no `data`, and the kind the scope knows.
    const counter = answer?.items.find((i) => i.label === '@counter');
    expect(counter?.detail).toBe('in scope');
    expect(counter?.labelDetails).toBeUndefined();
    expect(answer?.items.find((i) => i.label === '@onClick')?.kind).toBe(
      CompletionItemKind.Function,
    );
  });

  it('anchors every item on what was typed after the `@`, never on the `@` itself', async () => {
    // The editor filters an item against the text between the start of its replacement range
    // and the caret: with the `@` inside that range the text is `@c`, `counter` does not start
    // with it, and the item is dropped after arriving correctly.
    const answer = await completeAt('@c|', list(item('counter')));
    const counter = answer?.items.find((i) => i.label === '@counter');

    expect(counter?.textEdit).toBeDefined();
    const range = (counter?.textEdit as { range: { start: { character: number } } }).range;
    expect(range.start.character).toBe(
      ((counter?.textEdit as { range: { end: { character: number } } }).range.end.character - 1),
    );
  });
});

describe('the same answer is not said twice', () => {
  it('collapses the repeats Volar produces by asking once per mapping', async () => {
    // One caret maps into the projection at more than one generated position, and every
    // plugin is asked at each: the editor rendered `handlerClick` three times. The request's
    // cancellation token is what identifies the request, so the second call with the SAME
    // token keeps only what the first did not say.
    const { source, cached, client, document } = project('@');
    // AFTER the `@`, which is where the caret is when the list is asked for.
    const at = source.indexOf('<p>') + '<p>'.length + 1;
    const position = document.positionAt(mapToGenerated(client, at, 'completion') ?? 0);
    const service = wrap(list(item('counter')), { [FUD_URI.toString()]: cached }, () => [
      FUD_URI,
      CLIENT_CODE_ID,
    ]);
    const ask = async (): Promise<readonly string[]> =>
      (
        (await service.provideCompletionItems?.(
          document,
          position,
          { triggerKind: 1 },
          TOKEN,
        )) as CompletionList
      ).items.map((i) => i.label);

    const first = await ask();
    const second = await ask();

    expect(first).toContain('@counter');
    expect(second).toEqual([]);
  });

  it('starts over for a new request, so pressing Ctrl+Space again answers again', async () => {
    const { source, cached, client, document } = project('@');
    // AFTER the `@`, which is where the caret is when the list is asked for.
    const at = source.indexOf('<p>') + '<p>'.length + 1;
    const position = document.positionAt(mapToGenerated(client, at, 'completion') ?? 0);
    const service = wrap(list(item('counter')), { [FUD_URI.toString()]: cached }, () => [
      FUD_URI,
      CLIENT_CODE_ID,
    ]);
    const ask = async (token: typeof TOKEN): Promise<readonly string[]> =>
      (
        (await service.provideCompletionItems?.(
          document,
          position,
          { triggerKind: 1 },
          token,
        )) as CompletionList
      ).items.map((i) => i.label);

    await ask(TOKEN);
    const again = await ask({ ...TOKEN });

    expect(again).toContain('@counter');
  });
});

/**
 * The positions inside a start tag, where TypeScript's names are right and its EDITS are not.
 *
 * Every object literal the projection puts there is ours — `$props`, `$attrs`, `$gap` — so a
 * key TypeScript enumerates is a key we invented, in the shape the projection needed and not in
 * the shape the author types. Each branch rewrites them into what goes in the file.
 */
describe('inside a start tag', () => {
  const labels = (answer: CompletionList | undefined | null): string[] =>
    (answer?.items ?? []).map((i) => i.label);
  const edit = (answer: CompletionList | undefined | null, label: string): string | undefined => {
    const found = answer?.items.find((i) => i.label === label);
    return found?.textEdit && 'newText' in found.textEdit ? found.textEdit.newText : undefined;
  };

  it('rewrites a prop reached with the dot into `name=@`, and asks again', async () => {
    // The same prop behaved differently depending on whether it was reached with Ctrl+Space or
    // by typing the dot, which is the kind of difference nobody can learn.
    const answer = await completeAt(
      '<app-badge .|></app-badge>',
      list(item('tone?', { kind: CompletionItemKind.Field })),
    );

    expect(labels(answer)).toEqual(['tone']);
    expect(edit(answer, 'tone')).toBe('tone=@');
    expect(answer?.items[0]?.command?.command).toBe('editor.action.triggerSuggest');
    expect(answer?.items[0]?.detail).toBe('prop');
  });

  it('and keeps TypeScript’s own order where it gave one', async () => {
    const answer = await completeAt(
      '<app-badge .|></app-badge>',
      list(
        item('tone?', { kind: CompletionItemKind.Field, sortText: '11' }),
        item('name?', { kind: CompletionItemKind.Field }),
      ),
    );

    expect(answer?.items.map((i) => i.sortText)).toEqual(['11', 'name']);
  });

  it('answers a gap with the three vocabularies at once, sorted apart', async () => {
    // The props arrive from `$gap` with their dot inside a QUOTED key, because `.tone` is not
    // an identifier — that accident is the whole discriminator between the component's
    // contract and HTML's own. The classes and `slot` ride along rather than coming from the
    // root: an additional plugin runs on the FIRST mapping alone, and a gap maps into the
    // projection, so whatever is to appear beside TypeScript's answer travels inside it.
    const answer = await completeAt(
      '<app-badge |></app-badge>',
      list(
        item('".tone"?', { kind: CompletionItemKind.Field }),
        item('role?', { kind: CompletionItemKind.Field }),
      ),
    );

    expect(labels(answer)).toEqual(['.tone', 'role', 'class:red', 'slot']);
    // A prop is written `.tone=@expr`, so accepting one writes the `=@` and asks again; an
    // HTML attribute takes a literal, so it gets the quotes and the caret between them.
    expect(edit(answer, '.tone')).toBe('.tone=@');
    expect(edit(answer, 'role')).toBe('role="$1"');
    // The order is entirely ours: TypeScript hands every key back with the same `sortText`.
    expect(answer?.items.map((i) => i.sortText)).toEqual(['0_.tone', '2_role', '1_red', '2_slot']);
    // A binding with no expression is half of one, so the class writes its `=@` too.
    expect(edit(answer, 'class:red')).toBe('class:red=@');
    expect(edit(answer, 'slot')).toBe('slot="$1"');
  });

  it('stamps a slot name’s range from the SOURCE, where it has no quotes', async () => {
    // `emitIntoSlot` projects the name with its quotes over a span that has none, so every
    // offset TypeScript reports inside that stretch is two characters adrift — and the range
    // came back landing beside the `P` instead of over it.
    const answer = await completeAt(
      '<app-badge><div slot="P|"></div></app-badge>',
      list(item('PEPITO'), item('meta', { sortText: '11' })),
    );

    expect(labels(answer)).toEqual(['PEPITO', 'meta']);
    expect(answer?.items[0]?.detail).toBe('slot of the parent');
    expect(answer?.items.map((i) => i.sortText)).toEqual(['PEPITO', '11']);
    expect(edit(answer, 'PEPITO')).toBe('PEPITO');
  });

  it('writes the `=@` behind an event name, which is the other half of the binding', async () => {
    const answer = await completeAt(
      '<app-badge @cli|></app-badge>',
      list(item('click'), item('change', { kind: CompletionItemKind.Event, sortText: '11' })),
    );

    expect(labels(answer)).toEqual(['click', 'change']);
    expect(edit(answer, 'click')).toBe('click=@');
    expect(answer?.items[0]?.command?.command).toBe('editor.action.triggerSuggest');
    expect(answer?.items.map((i) => i.kind)).toEqual([
      CompletionItemKind.Variable,
      CompletionItemKind.Event,
    ]);
  });

  it('and gives an event with no kind of its own the one it is', async () => {
    const answer = await completeAt('<app-badge @cli|></app-badge>', {
      isIncomplete: false,
      items: [{ label: 'click' }],
    });

    expect(answer?.items[0]?.kind).toBe(CompletionItemKind.Event);
  });

  it('offers no event at all in a LAYOUT, where no handler can ever be named', async () => {
    // `keyof HTMLElementEventMap` is as true there as anywhere and still the wrong answer: an
    // event is written `@click=@handler`, and a layout has no `@code` (`FUD0437`) and therefore
    // no handler to name. Empty, and the position stays closed, so nothing fills the silence.
    const answer = await completeAt('<div @cli|></div>', list(item('click')), { build: layout });

    expect(answer?.items).toEqual([]);
  });

  it('does not empty the value of an attribute whose NAME is an expression', async () => {
    // `bus:(EVENTS.cart)` is not HTML's attribute and not a plain one either — there is no name
    // to compare, because the name IS an expression — so TypeScript's reply travels on rather
    // than being emptied for HTML to answer in its place.
    const answer = await completeAt(
      '<app-badge bus:(EVENTS.cart)=|></app-badge>',
      list(item('counter')),
    );

    expect(labels(answer)).toContain('counter');
  });

  it('says nothing at a value the author opened with a `.`, which is FUD0056', async () => {
    // FIRST of all the branches, because every one below would otherwise recognise its own
    // shape in it and answer with a list where the compiler is reporting an error.
    const answer = await completeAt(
      '<app-badge .name=.|></app-badge>',
      list(item('tone?', { kind: CompletionItemKind.Field })),
    );

    expect(answer?.items).toEqual([]);
  });

  it('drops a raw member wherever no branch claimed the position', async () => {
    // The caret glued to the tag's own name is one: it maps into the gap anchor, and
    // `attributeGapContextAt` declines it because there the NAME is being typed and
    // `tagContextAt` owns that. What is left is a key WE invented, in the shape the projection
    // needed — `".tone"?` — and never in the shape the author types.
    const answer = await completeAt(
      '<app-badge| .tone="x"></app-badge>',
      list(item('"aria-sort"?', { kind: CompletionItemKind.Field }), item('counter')),
    );

    expect(labels(answer)).not.toContain('"aria-sort"?');
    expect(labels(answer)).toContain('counter');
  });

  it('and says nothing at all inside the value of a PLAIN attribute', async () => {
    // `slot=".` is the case that proved it: with the dot making the name broken, this server's
    // own branch stands aside and TypeScript's `'PEPITO'` came through with the PROJECTION's
    // range, which inserts beside the dot instead of over it. Empty rather than filtered is
    // what lets HTML answer — Volar hands the position on only when a list comes back bare.
    const answer = await completeAt(
      '<app-badge><div slot=".|"></div></app-badge>',
      list(item('"PEPITO"')),
    );

    expect(answer?.items).toEqual([]);
  });

  it('but not inside a `.prop`, an `@event` or anything with a `:`', async () => {
    // Their values are expressions and TypeScript owns them, narrowed by the branches above.
    const answer = await completeAt(
      '<app-badge class:red="@|"></app-badge>',
      list(item('counter')),
    );

    expect(labels(answer)).toContain('@counter');
  });
});

/**
 * The value of a `control`, which is the one binding whose list is not «what the template can
 * see» (SDD-34 §4.1, decision 109).
 *
 * TypeScript's answer at those offsets is a correct SCOPE and the wrong list: `data`, the
 * handlers and every string prop sit beside the two names that fit. Nothing in TypeScript can
 * narrow it — an argument position takes what it takes, and a wrong value is an error rather
 * than an absence — so the shape is asked of the checker apart and the reply filtered by it.
 * Which is why these run over a REAL program: a hand-made checker would be a second
 * implementation of the very rule under test.
 */
describe('the value of a `control`', () => {
  const labels = (answer: CompletionList | undefined | null): string[] =>
    (answer?.items ?? []).map((i) => i.label);

  /** A page whose `@code` declares a form, wrapped in the `<form>` that opens its scope. */
  const formPage = (markup: string): string =>
    `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">
@code {
  type Control<T> = { (): T; set(v: T): void; touch(): void };
  type Group<S> = S & { $touch(): void; $validate(): Promise<boolean> };
  const userForm = {} as Group<{ alias: Control<string>; address: Group<{ street: Control<string> }> }>;
  const alias = userForm.alias;
  const plain = 'x';
}

<article>
  <form control="@userForm">
    ${markup}
  </form>
</article>
`;

  /** What TypeScript answers at any of these offsets: the scope, which is names and no shapes. */
  const scope = () =>
    list(item('userForm'), item('alias'), item('plain'), item('address'), item('street'));

  const inForm = (markup: string, answer = scope()) =>
    completeAt(markup, answer, { build: formPage, typescript: true });

  it('keeps the names that are nodes and drops the ones that are not', async () => {
    const answer = await inForm('<input control="@|">');

    expect(labels(answer)).toEqual(['userForm', 'alias']);
  });

  it('offers a group on an `<input>`, and never a control on a `<form>`', async () => {
    // `reaches` and not `accepts`: `@userForm` is not what an `<input>` binds, and it is the
    // only way to write what it does. A control the other way round is where a path ends, so
    // it neither fits on a `<form>` nor leads anywhere from it.
    const answer = await inForm('<form control="@|"></form>');

    expect(labels(answer)).toEqual(['userForm']);
  });

  it('after the dot, offers the fields and never the form’s own API', async () => {
    // `$validate`, `$touch` and the rest fall out for free: none of them has the shape of a
    // node, so no list of names is kept here to exclude them.
    const answer = await inForm(
      '<input control="@userForm.|">',
      list(item('alias'), item('address'), item('$validate'), item('$touch')),
    );

    expect(labels(answer)).toEqual(['alias', 'address']);
  });

  it('says which kind each name is, so the list explains itself', async () => {
    const answer = await inForm('<input control="@userForm.|">', list(item('alias'), item('address')));

    expect(answer?.items.map((i) => i.detail)).toEqual(['control', 'form node']);
  });

  it('writes the `@` itself where the value is still empty', async () => {
    // `control=|` is where Ctrl+Space lands before a single character of the value exists. The
    // items are built from the names rather than filtered out of TypeScript's reply: the
    // projection holds one mapped space there, so what the checker offers is a scope.
    const answer = await inForm('<input control=|>', list(item('unrelated')));

    expect(labels(answer)).toEqual(['@userForm', '@alias']);
    expect(answer?.items[0]?.filterText).toBe('userForm');
    expect(answer?.items.map((i) => i.detail)).toEqual(['form node', 'control']);
  });

  it('and offers there only what the element can be reached through', async () => {
    // The same position on a `<form>`: a control is where a path ends, so it is not a step.
    const answer = await inForm('<form control=|></form>', list(item('unrelated')));

    expect(labels(answer)).toEqual(['@userForm']);
  });

  it('stands aside at that position when the file declares no node at all', async () => {
    // Nothing rather than an empty list: an empty widget stays open over the value and swallows
    // the next Tab.
    const answer = await completeAt('<input control=|>', list(item('counter')), {
      typescript: true,
    });

    expect(labels(answer)).not.toContain('@counter');
    expect(answer?.items ?? []).toEqual([]);
  });

  it('stands aside after a dot on something that is not a node', async () => {
    const answer = await inForm('<input control="@plain.|">', list(item('length')));

    expect(labels(answer)).toContain('length');
  });

  it('stands aside inside a value that is neither an expression nor empty', async () => {
    // `control="x|"` — the prototype's spelling with no `@`, which the grammar rejects. There
    // is no node being written and no `@` about to be, so this branch has nothing to narrow and
    // the position falls to the rule below it: inside a plain attribute value, TypeScript says
    // nothing at all, and the empty list is what lets HTML answer.
    const answer = await inForm('<input control="x|">', list(item('userForm')));

    expect(answer?.items).toEqual([]);
  });

  it('stands aside on an element that can make nothing of a control', async () => {
    // `<input type="submit">` is `FUD0592`. The branch returns nothing and the list that was
    // there before this narrowing existed comes back — a wide list is poor, a wrong one is not.
    const answer = await inForm('<input type="submit" control="@|">');

    expect(labels(answer)).toContain('@plain');
  });

  it('stands aside when no TypeScript is mounted at all', async () => {
    // SDD-24 §6.1: the checker is what says which name is a node, and with no answer from it
    // the position falls through to the branches that were there before.
    const answer = await completeAt('<input control="@|">', scope(), { build: formPage });

    expect(labels(answer)).toContain('@plain');
  });

  it('offers `control` itself at a gap on a component tag (decision 112)', async () => {
    // On a component it IS the `ctrl` prop under the name the parent writes, and the author has
    // no way to guess that from the contract. It rides inside TypeScript's own reply, because an
    // additional plugin runs on the first mapping alone.
    const answer = await inForm(
      '<app-badge |></app-badge>',
      list(item('"tone"', { kind: CompletionItemKind.Field })),
    );
    const control = answer?.items.find((i) => i.label === 'control');

    expect(control?.detail).toBe('control node of the form');
    expect(control?.insertText).toBe('control=@');
  });

  it('and never outside a form, where the attribute would be `FUD0595`', async () => {
    const answer = await completeAt(
      '<app-badge |></app-badge>',
      list(item('"tone"', { kind: CompletionItemKind.Field })),
      { typescript: true },
    );

    expect(labels(answer)).not.toContain('control');
  });
});
