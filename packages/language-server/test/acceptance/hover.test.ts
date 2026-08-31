/**
 * SDD-36 §6, criterion 15 — the card with TypeScript alive.
 *
 * The two halves of the card are measured apart on purpose. The first one is proved without a
 * program anywhere (`test/services/tag-card.test.ts`), which is what criterion 14 asks; this
 * file is the other half, and it can only be measured here: the type of a prop comes from the
 * projection of a DIFFERENT file than the one being hovered — `<app-badge>` is written in
 * `[slug].fud` and its contract lives in `app-badge.fud` — so nothing short of a real program
 * over the real workspace proves the chain.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HoverRequest, type Hover, type Position } from 'vscode-languageserver-protocol/node';
import { fixtureText, fixtureUri, startHarness, type Harness } from './_harness.js';

const SLUG = 'blog/[slug].fud';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
  await harness.open(SLUG);
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

/** The Markdown of the hover at a position, or the empty string when there is none. */
async function cardAt(relative: string, needle: string, delta: number): Promise<string> {
  const hover = await harness.client.sendRequest(HoverRequest.type, {
    textDocument: { uri: fixtureUri(relative) },
    position: positionIn(relative, needle, delta),
  });
  const contents = (hover as Hover | null)?.contents;
  return typeof contents === 'object' && contents !== null && 'value' in contents
    ? String(contents.value)
    : '';
}

describe('the card of a component', () => {
  it('carries the type of each prop, read from the projection', async () => {
    const card = await cardAt(SLUG, '<app-badge ', 1);

    expect(card).toContain('**`<app-badge>`** · fudic component');
    // `Tone` is the alias the component declared, not the union it expands to: the projection
    // copies the type argument verbatim, so what the consumer reads is what the author wrote.
    expect(card).toContain('- `.tone?` — `Tone`');
  });

  it('names a component the consumer did not open', async () => {
    // `site-nav.fud` is never opened by this test, and its contract still resolves: the index
    // puts every `.fud` of the workspace in the program (BUG-23), so hovering it does not
    // depend on the developer having visited it first.
    expect(await cardAt(SLUG, '<site-nav ', 1)).toContain('- `.current?` — `string`');
  });

  it('leaves a native element to HTML', async () => {
    // Not «nothing»: HTML answers, and its answer is the right one. What must not appear is a
    // fudic card over an element that has no fudic contract (§4.6).
    const card = await cardAt(SLUG, '<article>', 1);

    expect(card).not.toContain('fudic component');
    expect(card).toContain('article element');
  });
});
