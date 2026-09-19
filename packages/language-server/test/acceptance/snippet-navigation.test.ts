/**
 * SDD-29 criteria 33 and 35 — go-to-definition and hover, over the live server.
 *
 * Neither is code of ours. A `@snippet` is projected as an exported function and a
 * `<link rel="snippet">` as an import (§4.11), and from that TypeScript answers both. That
 * is precisely why it has to be asserted HERE: a design whose whole claim is "TypeScript
 * gives it to us" is proved by asking TypeScript, over a real program, across two files —
 * and not by reading the projection and believing it.
 *
 * It runs on a PRIVATE copy of the fixture workspace. The shared one is four documents and
 * several suites assert over exactly those four while running in parallel.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
  DefinitionRequest,
  HoverRequest,
  type Hover,
  type Location,
  type Position,
} from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { copyWorkspace, startHarness, TSDK, type Harness } from './_harness.js';

/** A file of snippets: two declarations, one of them with a default. */
const UI_SOURCE = `@snippet ficha(titulo: string, tono: "neutral" | "success" = "neutral") {
  <article class="ficha">
    <h3>@titulo</h3>
    <span class="tono">@tono</span>
  </article>
}

@snippet pie(texto: string) {
  <small>@texto</small>
}
`;

/** A component that imports it and calls one of them. */
const PANEL_SOURCE = `<link rel="snippet" href="./ui.fud">

<app-panel>
  <template shadowrootmode="open">
    <section>@render ficha("Hola", tono: "success")</section>
  </template>
</app-panel>
`;

let harness: Harness;
let uiText = '';
let panelText = '';

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/components/ui.fud`, UI_SOURCE, 'utf8');
  writeFileSync(`${root}/components/app-panel.fud`, PANEL_SOURCE, 'utf8');

  harness = await startHarness({ root, tsdk: TSDK });
  ({ text: uiText } = await harness.open('components/ui.fud'));
  ({ text: panelText } = await harness.open('components/app-panel.fud'));
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** The position of `needle` in a text, `delta` characters in. */
function positionIn(text: string, needle: string, delta: number): Position {
  const at = text.indexOf(needle);
  expect(at, `${needle} is in the document`).toBeGreaterThan(-1);
  return harness.positionAt(text, at + delta);
}

/** The file a location points at, as a name. */
const fileOf = (location: Location): string => {
  const path = URI.parse(location.uri).path;
  return path.slice(path.lastIndexOf('/') + 1);
};

/** The text a range covers in `text`, so a span is asserted by what it points at. */
function textOf(text: string, location: Location): string {
  const lines = text.split('\n');
  const { start, end } = location.range;
  if (start.line !== end.line) return (lines[start.line] ?? '').slice(start.character);
  return (lines[start.line] ?? '').slice(start.character, end.character);
}

describe('criterion 33 — definition from a @render', () => {
  it('over the name of an imported snippet, opens the file that declares it', async () => {
    const answer = await harness.client.sendRequest(DefinitionRequest.type, {
      textDocument: { uri: harness.uriOf('components/app-panel.fud') },
      // Inside `ficha`, past the `@render `.
      position: positionIn(panelText, '@render ficha(', 10),
    });
    const [location, ...rest] = (answer ?? []) as Location[];

    expect(location, 'a definition was answered').toBeDefined();
    expect(rest).toEqual([]);
    expect(fileOf(location!)).toBe('ui.fud');
    // The span lands on the declaration's own name, in the other file.
    expect(textOf(uiText, location!)).toBe('ficha');
  });
});

describe('criterion 35 — hover over the name in a @render', () => {
  it('shows the full signature, defaults and all', async () => {
    const hover = (await harness.client.sendRequest(HoverRequest.type, {
      textDocument: { uri: harness.uriOf('components/app-panel.fud') },
      position: positionIn(panelText, '@render ficha(', 10),
    })) as Hover | null;

    const contents = hover?.contents;
    const card =
      contents === undefined
        ? ''
        : typeof contents === 'string'
          ? contents
          : 'value' in contents
            ? contents.value
            : '';

    // The whole signature, as the author wrote it: the parameter names, their types, and
    // the union of the second one. TypeScript renders a parameter that has a default as
    // optional — `tono?` — which is its own way of saying the call may leave it out.
    expect(card).toContain('function ficha(titulo: string, tono?: "neutral" | "success")');
  });
});
