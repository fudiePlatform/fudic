/**
 * SDD-64 §3.7, §4.7 and criteria 21–22, happy-dom's side: `outline` writes a painted piece's
 * accessibility tree in Playwright's ARIA snapshot format. The corpus is shared with the browser
 * test of `@fudic/workbench`, whose `outlineOf` is the reference: the two engines say the same.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { applyDsd } from '../src/dsd.js';
import { mount, outline } from '../src/index.js';
import * as AcmeButton from './fixtures/acme-button.fud';

interface Piece {
  readonly name: string;
  readonly html: string;
  readonly outline: string;
}

const { pieces } = JSON.parse(readFileSync(new URL('./fixtures/outline-corpus.json', import.meta.url), 'utf8')) as {
  pieces: readonly Piece[];
};

/** A piece as the parser leaves it: every declarative shadow root attached. */
function painted(html: string): Element {
  document.body.innerHTML = html;
  applyDsd(document.body);
  return document.body.firstElementChild!;
}

describe('criterion 21 — a disabled acme-button', () => {
  test('mounted from its .fud, it is a disabled button named Save', async () => {
    const t = await mount(AcmeButton, { props: { disabled: true } });
    expect(outline(t.root)).toBe('- button "Save" [disabled]');
  });

  test('enabled, the same button without the state', async () => {
    const t = await mount(AcmeButton, { props: { disabled: false } });
    expect(outline(t.root)).toBe('- button "Save"');
  });
});

describe('criterion 22 — the two engines say the same', () => {
  test('the corpus has at least eight pieces', () => {
    expect(pieces.length).toBeGreaterThanOrEqual(8);
  });

  test.each(pieces.map((p) => [p.name, p] as const))('%s', (_name, piece) => {
    expect(outline(painted(piece.html))).toBe(piece.outline);
  });
});

describe('outline — its roots, and what only script can set', () => {
  test('a document, a shadow root and an element give the same piece', () => {
    const host = painted('<ui-x><template shadowrootmode="open"><button>Go</button></template></ui-x>');
    expect(outline(document)).toBe('- button "Go"');
    expect(outline(host.shadowRoot!)).toBe('- button "Go"');
    expect(outline(host)).toBe('- button "Go"');
  });

  test('an indeterminate checkbox is checked=mixed', () => {
    const host = painted('<ui-x><template shadowrootmode="open"><input type="checkbox" aria-label="Some"></template></ui-x>');
    (host.shadowRoot!.querySelector('input') as HTMLInputElement).indeterminate = true;
    expect(outline(host)).toBe('- checkbox "Some" [checked=mixed]');
  });

  test('a textarea shows what is typed in it, not what it was written with', () => {
    const host = painted('<ui-x><template shadowrootmode="open"><textarea aria-label="Notes">old</textarea></template></ui-x>');
    (host.shadowRoot!.querySelector('textarea') as HTMLTextAreaElement).value = 'new';
    expect(outline(host)).toBe('- textbox "Notes": new');
  });

  test('a root with nothing in it is the empty text', () => {
    expect(outline(painted('<ui-x><template shadowrootmode="open"></template></ui-x>'))).toBe('');
  });
});
