/**
 * SDD-63 §6.11–6.13 and §6.15 — the editor side, over the real two-app workspace.
 *
 * Three servers, because the three questions are asked from three places: the card and the
 * tokens from inside `apps/tienda` (where `ui-card` is a library's), the references from the
 * workspace root (where both apps are swept), and the detail of an event over a private copy of
 * the fixtures (the example workspace emits no event).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  DefinitionRequest,
  HoverRequest,
  ReferencesRequest,
  type CompletionItem,
  type CompletionList,
  type Hover,
  type Location,
  type LocationLink,
} from 'vscode-languageserver-protocol/node';
import { toPosix } from '@fudic/typecheck';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const WORKSPACE = toPosix(fileURLToPath(new URL('../../../../examples/workspace', import.meta.url)));
const TIENDA_HOME = 'src/routes/index.fud';
const TIENDA_CARD = 'src/components/tienda-card/tienda-card.fud';

/** A component that emits an event with a detail, and the page that uses it. */
const PRESS = `@code {
  import { emit } from "@fudic/dom";
  const count: number = 1;
  function go() {
    /** Fired on click. The detail is the click count. */
    emit('press', count);
  }
}

<app-press>
  <template shadowrootmode="open"><button onclick="@go">x</button></template>
</app-press>
`;
const PRESS_PAGE = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-press.fud">

<app-press></app-press>
`;

let atApp: Harness;
let atRoot: Harness;
let withPress: Harness;

beforeAll(async () => {
  const copy = copyWorkspace();
  mkdirSync(`${copy}/src/pages`, { recursive: true });
  writeFileSync(`${copy}/src/components/app-press.fud`, PRESS);
  writeFileSync(`${copy}/src/pages/press.fud`, PRESS_PAGE);

  [atApp, atRoot, withPress] = await Promise.all([
    startHarness({ root: `${WORKSPACE}/apps/tienda` }),
    startHarness({ root: WORKSPACE, warmup: `apps/tienda/${TIENDA_HOME}` }),
    startHarness({ root: copy }),
  ]);
}, 180_000);

afterAll(async () => {
  await Promise.all([atApp.stop(), atRoot.stop(), withPress.stop()]);
});

/** The Markdown of the hover at `offset` of `relative`, opened with `text`. */
async function hoverText(harness: Harness, relative: string, text: string, offset: number): Promise<string> {
  const { uri } = await harness.open(relative, text);
  const hover = (await harness.client.sendRequest(HoverRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, offset),
  })) as Hover | null;
  const contents = hover?.contents;
  return typeof contents === 'object' && contents !== null && 'value' in contents ? String(contents.value) : '';
}

describe('§6.11 — the card of a library component', () => {
  it('shows its sections in order, with «Events» in English and the library in the header', async () => {
    const source = (await atApp.open(TIENDA_HOME)).text;
    const card = await hoverText(atApp, TIENDA_HOME, source, source.indexOf('<ui-card') + 2);

    expect(card.startsWith('**`<ui-card>`** · fudic component · @fudic/example-ui')).toBe(true);
    expect(card).toContain('A card with a title, framed with the guide');
    expect(card).toContain('**Props**\n- `.title` — `string`\n  The heading of the card: one short line.');
    expect(card).toContain('**Slots**\n- (default)');
    expect(card).toContain('**Tokens**\n- `--guia-line`, `--guia-accent`, `--guia-radius`, `--guia-pad`');
    // Sections it does not have are not printed.
    expect(card).not.toContain('**Events**');
    expect(card).not.toContain('**Parts**');
    const order = ['**Props**', '**Slots**', '**Tokens**'].map((heading) => card.indexOf(heading));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("names nothing after «component» for the project's own", async () => {
    const source = (await atApp.open(TIENDA_HOME)).text;
    const card = await hoverText(atApp, TIENDA_HOME, source, source.indexOf('<tienda-card') + 2);

    expect(card.split('\n')[0]).toBe('**`<tienda-card>`** · fudic component');
  });
});

describe('§6.12 — the tokens in the `<style>` of a `.fud` of tienda', () => {
  /** `tienda-card.fud` with `var(--` written at the start of its `:host` rule, and where it ends. */
  const edited = async () => {
    const original = (await atApp.open(TIENDA_CARD)).text;
    const anchor = original.indexOf('display: block;');
    const text = `${original.slice(0, anchor)}color: var(--guia-ink); outline: var(--${original.slice(anchor)}`;
    return { text, typed: anchor + 'color: var(--guia-ink); outline: var(--'.length, ink: anchor + 'color: var(--gu'.length };
  };

  it('offers the guide tokens after `var(--`, with their value and their doc', async () => {
    const { text, typed } = await edited();
    const { uri } = await atApp.open(TIENDA_CARD, text);
    const answer = (await atApp.client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: atApp.positionAt(text, typed),
    })) as CompletionList | CompletionItem[] | null;
    const items = Array.isArray(answer) ? answer : (answer?.items ?? []);
    // The CSS service offers the variables the same `<style>` already uses, without a value;
    // the token service's item is the one that carries it.
    const ofTokens = items.filter((item) => item.detail !== undefined);
    const ink = ofTokens.find((item) => item.label === '--guia-ink');
    const accent = ofTokens.find((item) => item.label === '--guia-accent');

    expect(ink?.detail).toBe('#1c1c1e');
    expect(JSON.stringify(ink?.documentation)).toContain('Body text.');
    // tienda redeclares `--guia-accent` in its own sheet, and the last declaration is the one
    // that wins in CSS — so that is the one offered.
    expect(accent?.detail).toBe('#0f7b3f');
  });

  it('says on hover the value, the doc and the library, and goes to its declaration', async () => {
    const { text, ink } = await edited();
    const { uri } = await atApp.open(TIENDA_CARD, text);
    const hover = await hoverText(atApp, TIENDA_CARD, text, ink);

    expect(hover).toContain('`--guia-ink: #1c1c1e`');
    expect(hover).toContain('Body text. Use it for anything read, never for a border.');
    expect(hover).toContain('From `@fudic/example-guia` · style `tokens`');

    const answer = (await atApp.client.sendRequest(DefinitionRequest.type, {
      textDocument: { uri },
      position: atApp.positionAt(text, ink),
    })) as (Location | LocationLink)[] | null;
    // As a link or as a plain location, whichever the client said it reads.
    const targets = (answer ?? []).map((it) =>
      'targetUri' in it ? { uri: it.targetUri, line: it.targetRange.start.line } : { uri: it.uri, line: it.range.start.line },
    );
    expect(targets).toContainEqual({ uri: expect.stringMatching(/\/libs\/guia\/tokens\.css$/u), line: 8 });
  });

  it("says over `--guia-accent` the app's value and doc, and the guide's value it overrides", async () => {
    const original = (await atApp.open(TIENDA_CARD)).text;
    const anchor = original.indexOf('display: block;');
    const text = `${original.slice(0, anchor)}color: var(--guia-accent); ${original.slice(anchor)}`;
    const hover = await hoverText(atApp, TIENDA_CARD, text, anchor + 'color: var(--gu'.length);

    // Volar merges the CSS service's own hover into the same answer; ours is one block of it.
    expect(hover).toContain(
      '`--guia-accent: #0f7b3f`\n\n' +
        "The storefront's green, over the guide's blue, for the components of this app.\n\n" +
        'From this project · style `tienda`\n\n' +
        'Overrides `#0b5fff` from `@fudic/example-guia` · style `tokens`',
    );
  });
});

describe('§6.13 — the references of a tag', () => {
  it('lists the uses of `<ui-card>` in both apps', async () => {
    const relative = `apps/tienda/${TIENDA_HOME}`;
    const { uri, text } = await atRoot.open(relative);
    const answer = (await atRoot.client.sendRequest(ReferencesRequest.type, {
      textDocument: { uri },
      position: atRoot.positionAt(text, text.indexOf('<ui-card') + 2),
      context: { includeDeclaration: true },
    })) as Location[] | null;
    const files = (answer ?? []).map((location) => decodeURIComponent(location.uri));

    expect(files.some((file) => file.endsWith('/apps/tienda/src/routes/index.fud'))).toBe(true);
    expect(files.some((file) => file.endsWith('/apps/admin/src/routes/index.fud'))).toBe(true);
  });

  it('lists nothing off a tag', async () => {
    const relative = `apps/tienda/${TIENDA_HOME}`;
    const { uri, text } = await atRoot.open(relative);
    const answer = (await atRoot.client.sendRequest(ReferencesRequest.type, {
      textDocument: { uri },
      position: atRoot.positionAt(text, text.indexOf('data-app')),
      context: { includeDeclaration: true },
    })) as Location[] | null;

    expect(answer ?? []).toEqual([]);
  });
});

describe('§6.3 — the detail of an event, in the card', () => {
  it('is typed by the checker over the projection of the component', async () => {
    const source = (await withPress.open('src/pages/press.fud')).text;
    const card = await hoverText(withPress, 'src/pages/press.fud', source, source.indexOf('<app-press') + 2);

    expect(card).toContain('**Events**\n- `@press` — detail: `number`\n  Fired on click. The detail is the click count.');
  });
});
