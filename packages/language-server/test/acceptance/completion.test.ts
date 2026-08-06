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
