/**
 * SDD-64 §3.7 and criteria 21–22, the browser's side: `outlineOf` is Playwright's ARIA snapshot of
 * a painted piece. The pieces and their text are the ones `outline` of `@fudic/testing` writes in
 * happy-dom (`packages/testing/test/fixtures/outline-corpus.json`): the two engines say the same.
 */

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { outlineOf } from '../../src/outline.js';

interface Piece {
  readonly name: string;
  readonly html: string;
  readonly outline: string;
}

const CORPUS = new URL('../../../testing/test/fixtures/outline-corpus.json', import.meta.url);
const { pieces } = JSON.parse(readFileSync(CORPUS, 'utf8')) as { pieces: readonly Piece[] };

/** The host of a piece: the tag it opens with. */
const hostOf = (html: string) => /^<([a-z0-9-]+)/u.exec(html)![1]!;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
});

afterEach(async () => {
  await page.close();
});

describe('outlineOf — criterion 22, the reference', () => {
  it('the corpus has at least eight pieces', () => {
    expect(pieces.length).toBeGreaterThanOrEqual(8);
  });

  it.each(pieces.map((p) => [p.name, p] as const))('%s', async (_name, piece) => {
    await page.setContent(piece.html);
    expect(await outlineOf(page, hostOf(piece.html))).toBe(piece.outline);
  });
});

describe('outlineOf — criterion 21', () => {
  it('a disabled acme-button is a disabled button named Save', async () => {
    await page.setContent('<acme-button><template shadowrootmode="open"><button disabled>Save</button></template></acme-button>');
    expect(await outlineOf(page, 'acme-button')).toBe('- button "Save" [disabled]');
  });
});

describe('outlineOf — it never throws', () => {
  it('a selector that matches nothing in time is the first line of the error', async () => {
    page.setDefaultTimeout(200);
    await page.setContent('<p>x</p>');
    expect(await outlineOf(page, 'nothing-here')).toMatch(/^error: .*Timeout 200ms exceeded/u);
  });

  it('a selector that matches two is an error too', async () => {
    await page.setContent('<p>a</p><p>b</p>');
    expect(await outlineOf(page, 'p')).toMatch(/^error: .*strict mode violation/u);
  });
});
