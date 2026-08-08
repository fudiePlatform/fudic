/**
 * Criteria §6.7 and §6.8: going somewhere, and renaming something.
 *
 * Both are the inverse mapping under a different load than a diagnostic. A diagnostic travels
 * one way — the checker points at the virtual, the server answers over the `.fud` — while a
 * definition has to make the round trip inside one file and a rename has to come back as a set
 * of edits the editor may apply blind. An edit landing one character off is a corrupted file,
 * so the ranges are asserted by the text under them, never by counting characters.
 *
 * §6.9 — the inter-file half of navigation — is proved in `diagnostics.test.ts`, where changing
 * `Tone` repaints a file nobody touched.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DefinitionRequest,
  PrepareRenameRequest,
  RenameRequest,
  TypeDefinitionRequest,
  type Location,
  type Position,
  type Range,
  type WorkspaceEdit,
} from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { fixtureText, fixtureUri, startHarness, type Harness } from './_harness.js';

const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
  await harness.open(SLUG);
  await harness.open(BADGE);
  await harness.open('components/site-nav.fud');
  await harness.open('layouts/_layout.fud');
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** The position of `needle` in the file, `delta` characters in. */
function positionIn(relative: string, needle: string, delta: number): Position {
  const text = fixtureText(relative);
  const at = text.indexOf(needle);
  expect(at, `${needle} is in ${relative}`).toBeGreaterThan(-1);
  return harness.positionAt(text, at + delta);
}

/** The text a range covers, so a span is asserted by what it points at. */
function textOf(relative: string, range: Range): string {
  const lines = fixtureText(relative).split('\n');
  const { start, end } = range;
  if (start.line !== end.line) return (lines[start.line] ?? '').slice(start.character);
  return (lines[start.line] ?? '').slice(start.character, end.character);
}

async function definitionAt(relative: string, needle: string, delta: number): Promise<Location[]> {
  const answer = await harness.client.sendRequest(DefinitionRequest.type, {
    textDocument: { uri: fixtureUri(relative) },
    position: positionIn(relative, needle, delta),
  });
  return (answer ?? []) as Location[];
}

/** The file a location points at, as a workspace-relative path. */
const fileOf = (location: Location): string => {
  const path = URI.parse(location.uri).path;
  return path.slice(path.indexOf('/fixtures/') + '/fixtures/'.length);
};

describe('§6.7 — definition', () => {
  it('over a component tag, opens the .fud that defines it', async () => {
    // The opening tag and the closing one: the same knowledge, and the editor asks about both.
    for (const [needle, delta] of [
      ['<app-badge .tone', 2],
      ['</app-badge>', 4],
    ] as const) {
      const [location, ...rest] = await definitionAt(SLUG, needle, delta);

      expect(rest).toEqual([]);
      expect(fileOf(location!)).toBe('components/app-badge.fud');
    }
  });

  it('over a native tag, offers nothing', async () => {
    // `<article>` is HTML's, and HTML has no file to open. Answering anything here would be
    // answering about a tag this package knows nothing about.
    expect(await definitionAt(SLUG, '<article>', 2)).toEqual([]);
  });

  it('over @data.title, opens the property of the type load() returns', async () => {
    const [location, ...rest] = await definitionAt(SLUG, '<h1>@data.title</h1>', 11);

    expect(rest).toEqual([]);
    expect(fileOf(location!)).toBe('blog/[slug].fud');
    // `PageData` is the return type of `load()`, and the property is where `title` is declared.
    expect(textOf(SLUG, location!.range)).toBe('title: string;');
  });

  it('over data itself, the type definition is the whole shape', async () => {
    const answer = await harness.client.sendRequest(TypeDefinitionRequest.type, {
      textDocument: { uri: fixtureUri(SLUG) },
      position: positionIn(SLUG, '<h1>@data.title</h1>', 6),
    });
    const [location, ...rest] = (answer ?? []) as Location[];

    expect(rest).toEqual([]);
    expect(textOf(SLUG, location!.range)).toBe(
      '{ title: string; tag: string; body: string; found: boolean; note?: string }',
    );
  });

  it('over a prop in the template, opens its declaration in @code', async () => {
    // `tone` inside a binding of the component that declares it: same file, from the template
    // into the `@code` block.
    const [own] = await definitionAt(BADGE, `class:success="@(tone === 'success')"`, 18);

    expect(fileOf(own!)).toBe('components/app-badge.fud');
    expect(textOf(BADGE, own!.range)).toBe('tone');

    // And the same question asked from the file that USES the component: the attribute is a
    // property of the other file's contract, and F12 crosses the file boundary.
    const [other] = await definitionAt(SLUG, '<site-nav .current=', 11);

    expect(fileOf(other!)).toBe('components/site-nav.fud');
    expect(textOf('components/site-nav.fud', other!.range)).toBe('current?: string');
  });
});

describe('§6.8 — rename', () => {
  it('renames a prop from the template, declaration and references alike', async () => {
    const uri = fixtureUri(BADGE);
    const position = positionIn(BADGE, `class:success="@(tone === 'success')"`, 18);

    const prepared = (await harness.client.sendRequest(PrepareRenameRequest.type, {
      textDocument: { uri },
      position,
    })) as Range | null;

    expect(prepared).not.toBeNull();
    expect(textOf(BADGE, prepared!)).toBe('tone');

    const edit = (await harness.client.sendRequest(RenameRequest.type, {
      textDocument: { uri },
      position,
      newName: 'flavour',
    })) as WorkspaceEdit;

    const edits = edit.changes?.[uri] ?? [];
    // Nothing outside this file is touched: the prop is this component's own name, and the
    // pages that pass it keep passing `tone` until the contract they see changes with it.
    expect(Object.keys(edit.changes ?? {})).toEqual([uri]);

    const applied = edits
      .map((change) => ({ was: textOf(BADGE, change.range), now: change.newText }))
      .sort((a, b) => a.now.localeCompare(b.now));

    expect(applied).toEqual([
      // The two references in the template.
      { was: 'tone', now: 'flavour' },
      { was: 'tone', now: 'flavour' },
      // The declaration: a shorthand binding cannot just be renamed, so TypeScript expands it
      // and the prop of the contract keeps its name. That is the correct edit, not a stray one.
      { was: 'tone', now: 'tone: flavour' },
    ]);
  });

  it('is not offered over a stretch that only carries diagnostics', async () => {
    // `@section nav` is projected as `$section<$L0>('nav')`: invented text, mapped so that the
    // error of a section the layout does not declare reaches the name (SDD-23), and nothing
    // else. There is no symbol here to rename — `nav` is a member of a union in the layout —
    // so the editor must not offer to rename it.
    const prepared = await harness.client.sendRequest(PrepareRenameRequest.type, {
      textDocument: { uri: fixtureUri(SLUG) },
      position: positionIn(SLUG, '@section nav {', 10),
    });

    expect(prepared).toBeNull();

    const edit = await harness.client.sendRequest(RenameRequest.type, {
      textDocument: { uri: fixtureUri(SLUG) },
      position: positionIn(SLUG, '@section nav {', 10),
      newName: 'footer',
    });

    expect(edit).toBeNull();
  });

  it('over a component tag, stays inside the file that wrote it', async () => {
    // The HTML service renames the tag pair, which is HTML's business and a local edit. What
    // must NOT happen is the projection joining in: the tag is projected as a type alias the
    // user never wrote, and renaming that would rewrite `app-badge.fud` from a page.
    const uri = fixtureUri(SLUG);
    const edit = (await harness.client.sendRequest(RenameRequest.type, {
      textDocument: { uri },
      position: positionIn(SLUG, '<app-badge .tone', 2),
      newName: 'app-other',
    })) as WorkspaceEdit;

    expect(Object.keys(edit.changes ?? {})).toEqual([uri]);
    expect((edit.changes?.[uri] ?? []).map((change) => textOf(SLUG, change.range))).toEqual([
      'app-badge',
      'app-badge',
    ]);
  });
});
