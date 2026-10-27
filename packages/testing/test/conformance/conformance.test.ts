/**
 * The conformance suite of the portable view (SDD-61 §4.6, criteria 29 and 37).
 *
 * One `.fud` per row of the whitelist, beside it the server's HTML it must give (`.html`) and,
 * when its props are not its defaults, the data it is painted with (`.fixture.ts`, case
 * `conformance`). The `.html` is what the shadow root of the component holds, byte for byte,
 * as the server writes it: the seed every runtime of another language has to pass.
 *
 * What a pipe formats is the platform's ICU, and may differ from one runtime to the next (annex
 * A.4): the `.html` writes it `{{pipe}}`, which stands for any text, and everything else is
 * compared.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { fragmentOf } from '../../src/dsd.js';
import { mount, renderToHtml, type FudModule } from '../../src/index.js';

/** Where a pipe's formatted text stands in an `.html`. */
const PIPE = '{{pipe}}';

const rows = import.meta.glob<FudModule>('./*.fud');
const data = import.meta.glob<{ readonly default: { readonly conformance: object } }>('./*.fixture.ts', { eager: true });

/** The `.fud` of each row by its name: `./c-acceso.fud` → `c-acceso`. */
const names = Object.keys(rows).map((path) => basename(path, '.fud'));

/** The content of the declarative shadow root of `<tag>` on the page `html`, as written. */
function shadowOf(html: string, tag: string): string {
  const open = '<template shadowrootmode="open">';
  const start = html.indexOf(open, html.indexOf(`<${tag}`)) + open.length;
  return html.slice(start, html.lastIndexOf(`</template></${tag}>`));
}

/** The expected `.html` as a pattern: every byte literal, save what a pipe formats. */
function patternOf(expected: string): RegExp {
  const literal = expected.split(PIPE).map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  return new RegExp(`^${literal.join('[^<]*?')}$`, 'u');
}

describe('the conformance suite: each row gives its .html, byte for byte', () => {
  // A row paints `now()` twice, served and then mounted: the clock stands still between them, or
  // a second that ticks in between tells the two apart. Only `Date`: the timers keep running.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-27T10:00:00Z') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  test('the suite has its rows', () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    test(name, async () => {
      const row = await rows[`./${name}.fud`]!();
      const props = data[`./${name}.fixture.ts`]?.default.conformance ?? {};
      const expected = readFileSync(new URL(`./${name}.html`, import.meta.url), 'utf8').replace(/\r?\n$/u, '');
      const html = shadowOf(await renderToHtml(row, { props }), row.tag);
      expect(html).toMatch(patternOf(expected));
      // Mounted, served and hydrated, the shadow root holds that very tree: the HTML parsed with
      // its declarative shadow roots attached, as the page that mounts it is.
      const t = await mount(row, { props });
      const parsed = document.createElement('div');
      parsed.append(fragmentOf(html));
      expect(t.root.innerHTML).toBe(parsed.innerHTML);
    });
  }
});
