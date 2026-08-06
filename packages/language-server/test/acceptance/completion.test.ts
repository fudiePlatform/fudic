/**
 * Criteria §6.3–§6.6 and §6.10: what the editor offers, and who answers.
 *
 * Three of these are TypeScript's over the projection — an attribute is a property of `$Props`,
 * a value is a member of a union — and two are the server's own, because no language service
 * knows what a `<link rel="component">` or an `@section` is. The test does not care which:
 * it asks the way an editor asks.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CompletionRequest,
  DocumentDiagnosticRequest,
  type CompletionItem,
  type CompletionList,
  type FullDocumentDiagnosticReport,
} from 'vscode-languageserver-protocol/node';
import { fixtureText, startHarness, type Harness } from './_harness.js';

const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';

let harness: Harness;
let version = 1;

/**
 * Write `text` into `relative` and ask for completion at `offset`.
 *
 * Takes an offset rather than a `|` marker because the marker cannot be used on a file that
 * already contains one, and `app-badge.fud` does: its `Tone` is a union type.
 */
async function completeIn(
  relative: string,
  text: string,
  offset: number,
): Promise<CompletionItem[]> {
  const { uri } = await harness.open(relative);
  await harness.change(uri, text, ++version);

  const answer = await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, offset),
  });

  const list = answer as CompletionList | CompletionItem[] | null;
  if (list === null) return [];
  return Array.isArray(list) ? list : list.items;
}

/** Rewrite `relative` with the cursor at `|` and ask for completion there. */
async function completeAt(relative: string, marked: string): Promise<CompletionItem[]> {
  return completeIn(relative, marked.replace('|', ''), marked.indexOf('|'));
}

/**
 * The same request an editor makes when the user types a character (BUG-15 §2.3).
 *
 * `triggerKind: 2` plus the character is not a decoration: Volar SKIPS every plugin that does
 * not declare that character, so what the client is told in `initialize` decides who is even
 * in the room. A harness that always sends an invoked request measures a client that does not
 * exist — which is exactly how the defects of §2.3 and §2.4 got in.
 */
async function completeTyping(
  relative: string,
  marked: string,
  triggerCharacter: string,
): Promise<CompletionItem[]> {
  const text = marked.replace('|', '');
  const { uri } = await harness.open(relative);
  await harness.change(uri, text, ++version);

  const answer = await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, marked.indexOf('|')),
    context: { triggerKind: 2, triggerCharacter },
  });

  const list = answer as CompletionList | CompletionItem[] | null;
  if (list === null) return [];
  return Array.isArray(list) ? list : list.items;
}

const labels = (items: CompletionItem[]): string[] => items.map((item) => item.label);

beforeAll(async () => {
  harness = await startHarness();
  await harness.open(BADGE);
  await harness.open('components/site-nav.fud');
  await harness.open('layouts/_layout.fud');
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

describe('§6.3 — attributes and their values', () => {
  it('offers the props of a component inside its tag', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article>\n  <app-badge |></app-badge>\n</article>\n`,
    );

    // TypeScript labels an optional property with its `?`.
    expect(labels(items)).toContain('tone?');
  });

  it('offers the members of the union inside the value', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article>\n  <app-badge tone="@(|)"></app-badge>\n</article>\n`,
    );

    // String-literal completions come quoted, as they are written in the source.
    expect(labels(items)).toEqual(
      expect.arrayContaining(["'neutral'", "'success'", "'info'"]),
    );
  });
});

describe('§6.4 — tags', () => {
  it('offers the declared component apart from the native elements', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article>\n  <|\n</article>\n`,
    );

    const badge = items.find((item) => item.label === 'app-badge');
    expect(badge).toBeDefined();
    // Told apart from the native elements by where it sorts and by what it says it is.
    expect(badge?.sortText).toBe('0_app-badge');
    expect(badge?.labelDetails?.description).toBe('fudic component');
  });
});

describe('§6.5 — href', () => {
  it('lists the components for rel="component" and no page or layout among them', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="|">\n<article>hi</article>\n`,
    );

    // The server's own items are the ones that say what they are; the HTML service also
    // contributes raw paths at the same position, and the editor shows both lists.
    const ours = items.filter((item) => typeof item.detail === 'string' && item.detail.includes('·'));
    expect(labels(ours)).toEqual([
      '../components/app-badge.fud',
      '../components/site-nav.fud',
    ]);
    expect(labels(ours).some((label) => label.includes('[slug]'))).toBe(false);
  });

  it('lists the layouts for rel="layout"', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="|">\n<article>hi</article>\n`,
    );

    const ours = items.filter((item) => item.detail === 'layout');
    expect(labels(ours)).toEqual(['../layouts/_layout.fud']);
  });
});

describe('§6.6 — sections', () => {
  it('offers nav, and only nav', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n@section |\n<article>hi</article>\n`,
    );

    expect(labels(items)).toEqual(['nav']);
  });
});

describe('BUG-15 §6.1 — the classes this file declares', () => {
  it('offers them after `class:`', async () => {
    // The component's own `<style>`, thirty lines up, declares exactly these three and there
    // is no fourth possible. The `class:success` written here is replaced by the prefix alone,
    // which is the position the editor asks about.
    const source = fixtureText(BADGE).replace(`class:success="@(tone === 'success')"`, 'class:');
    const items = await completeIn(BADGE, source, source.indexOf('class:') + 'class:'.length);

    expect(labels(items)).toEqual(expect.arrayContaining(['badge', 'success', 'info']));
  });

  it('replaces what is already written rather than appending to it (§6.3)', async () => {
    const source = fixtureText(BADGE).replace(`class:success="@(tone === 'success')"`, 'class:suc');
    const at = source.indexOf('class:suc') + 'class:suc'.length;
    const items = await completeIn(BADGE, source, at);

    const success = items.find((item) => item.label === 'success');
    const range = success?.textEdit && 'range' in success.textEdit ? success.textEdit.range : undefined;
    // The edit covers the three characters typed after the colon, and not the `class:` itself.
    expect(range).toEqual({
      start: harness.positionAt(source, at - 'suc'.length),
      end: harness.positionAt(source, at),
    });
  });

  it('falls back to Emmet in a file with no <style> at all (§6.10)', async () => {
    const source = `<app-badge>\n  <template shadowrootmode="open">\n    <span class:></span>\n  </template>\n</app-badge>\n`;
    const items = await completeIn(BADGE, source, source.indexOf('class:') + 'class:'.length);

    // Nothing of ours, and the chain carried on: an empty list must not silence the rest.
    expect(items.some((item) => item.detail === 'class of this file')).toBe(false);
    expect(items.length).toBeGreaterThan(0);

    // Put the fixture back. This source has no `@code`, so leaving it behind would mean
    // app-badge stops declaring `tone` for every test that runs after this one.
    const { uri } = await harness.open(BADGE);
    await harness.change(uri, fixtureText(BADGE), ++version);
  });
});

describe('BUG-15 §6.11 — the fifth context takes nothing from the other four', () => {
  // The four are pinned by §6.3–§6.6 above and by the snippet suite; what these add is that
  // they still answer with a `class:` written into the same file, which is the one thing a
  // new branch in `completions()` could plausibly have broken.
  const WITH_CLASS = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n<article>\n  <app-badge class:x="@(true)"`;

  it('an href still answers alone', async () => {
    const items = await completeAt(SLUG, `${WITH_CLASS}></app-badge>\n</article>\n`.replace(
      '<link rel="component" href="../components/app-badge.fud">',
      '<link rel="component" href="|">',
    ));

    const list = items.filter((item) => typeof item.detail === 'string' && item.detail.includes('·'));
    expect(labels(list)).toEqual(['../components/app-badge.fud', '../components/site-nav.fud']);
  });

  it('@section still answers alone', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n@section |\n<article>\n  <span class:a="@(x)"></span>\n</article>\n`,
    );

    expect(labels(items)).toEqual(['nav']);
  });

  it('a tag after `<` still offers the component, sorted ahead', async () => {
    const items = await completeAt(
      SLUG,
      `${WITH_CLASS}></app-badge>\n  <|\n</article>\n`,
    );

    const badge = items.find((item) => item.label === 'app-badge');
    expect(badge?.sortText).toBe('0_app-badge');
  });

  it('a bare word still merges with Emmet instead of replacing it', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  <span class:a="@(x)"></span>\n  ul|\n</article>\n`,
    );

    // Emmet's abbreviation and ours in the same list: the merge of SDD-28 §5.3 survives.
    expect(items.length).toBeGreaterThan(1);
    expect(labels(items)).toContain('ul');
  });

  it('a @directive still answers', async () => {
    const items = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n  <span class:a="@(x)"></span>\n  @fore|\n</article>\n`,
    );

    expect(labels(items)).toContain('@foreach');
  });
});

describe('BUG-15 §6.13–§6.17 — inside an open tag, asked the way an editor asks', () => {
  const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-badge.fud">\n`;

  // §6.13 and §6.14 are asked INVOKED, which is what an editor sends once the space stops
  // being a trigger character. Asking them with `triggerCharacter: ' '` is what measured the
  // defect (the request came back with zero items), but it cannot measure the fix: the fix is
  // that the request is never made. After it, the space asks nothing and the first letter after
  // it asks an invoked completion with every plugin alive — which is what happens in a `.html`.
  it('§6.13 — a half-typed attribute offers the HTML ones', async () => {
    const items = await completeAt(SLUG, `${ROUTE}<article>\n  <div rol|>\n</article>\n`);

    expect(labels(items)).toContain('role');
  });

  it('§6.14 — the gap of a component tag offers its props', async () => {
    const items = await completeAt(
      SLUG,
      `${ROUTE}<article>\n  <app-badge |></app-badge>\n</article>\n`,
    );

    // TypeScript's, over the projection, through the completion anchor BUG-11 left in the tag
    // gap. It is criterion §6.3 of SDD-24 — the one the space was quietly turning off.
    expect(labels(items)).toContain('tone?');
  });

  it('§6.15 — the space is not a trigger character, and the others still are', async () => {
    const declared = harness.capabilities.capabilities.completionProvider?.triggerCharacters ?? [];

    expect(declared).not.toContain(' ');
    expect(declared).toEqual(expect.arrayContaining(['@', '<', ':', '.']));
  });

  it('§6.16 — a tag offers the component AND the native elements', async () => {
    const items = await completeTyping(SLUG, `${ROUTE}<article>\n  <di|\n</article>\n`, '<');

    // Ours is a voice more, not the last word: sorted ahead, with the native tags behind it.
    expect(labels(items)).toContain('app-badge');
    expect(labels(items)).toContain('div');
    expect(items.find((item) => item.label === 'app-badge')?.sortText).toBe('0_app-badge');
  });

  it('§6.17 — the exact contexts stay exclusive with the context set', async () => {
    // `"` is a trigger character of both this server and the HTML service, so this is the one
    // that shows the exclusivity is real and not an artefact of who got asked.
    const href = await completeTyping(
      SLUG,
      `${ROUTE}<link rel="component" href="|">\n<article>hi</article>\n`,
      '"',
    );
    expect(labels(href).every((label) => label.endsWith('.fud'))).toBe(true);

    const section = await completeAt(
      SLUG,
      `<link rel="layout" href="../layouts/_layout.fud">\n@section |\n<article>hi</article>\n`,
    );
    expect(labels(section)).toEqual(['nav']);
  });
});

describe('§6.10 — CSS', () => {
  it('reports a real mistake and says nothing about the shadow pseudos', async () => {
    // The four selectors a component is written with, and one typo. The virtual CSS starts at
    // offset 0 of the `.fud` (SDD-23), so every diagnostic here is already in `.fud` coordinates;
    // what this pins is that the service understands `:host` and `::slotted()` and still checks
    // the rest — a service that reported them would bury every real error under noise.
    const { uri } = await harness.open(BADGE);
    const source = fixtureText(BADGE).replace(
      ':host { display: inline-block; }',
      [
        ':host { display: inline-block; }',
        '    :host(.big) { font-size: 2rem; }',
        '    :host-context(main) { color: red; }',
        '    ::slotted(span) { font-weight: bold; }',
        '    .oops { colour: red; }',
      ].join('\n'),
    );
    await harness.change(uri, source, ++version);

    const report = (await harness.client.sendRequest(DocumentDiagnosticRequest.type, {
      textDocument: { uri },
    })) as FullDocumentDiagnosticReport;
    const css = report.items.filter((item) => item.source === 'css');

    expect(css.map((item) => item.code)).toEqual(['unknownProperties']);
    const line = source.split('\n')[css[0]!.range.start.line] ?? '';
    expect(line).toContain('colour');

    await harness.change(uri, fixtureText(BADGE), ++version);
  });

  it('completes properties inside <style>', async () => {
    const items = await completeAt(
      BADGE,
      `<head>\n  <style>\n    :host { dis| }\n  </style>\n</head>\n\n<app-badge>\n  <template shadowrootmode="open"><span><slot></slot></span></template>\n</app-badge>\n`,
    );

    expect(labels(items)).toContain('display');
  });
});
