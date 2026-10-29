import { describe, it, expect } from 'vitest';
import { publishIn, token } from '@fudic/di';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString } from '../src/serialize.js';
import { iocRoot } from '../src/ioc.js';
import { FLUSH, htmlToByteStream, type HtmlPiece } from '../src/stream.js';
import { PageParts, PART_END } from '../src/page-parts.js';

/**
 * A page in parts (SDD-70 §3.5, criterion 12): each part carries ONE block in front of it and
 * the marker behind it; the block holds only what that part produced, and the ids keep counting
 * across parts.
 */

const BLOCK = /<script type="application\/json" data-fud-part="(\d+)">(.*?)<\/script>/gu;

/** The blocks of a document, by part. */
function blocks(html: string): Map<number, Record<string, unknown>> {
  return new Map([...html.matchAll(BLOCK)].map((m) => [Number(m[1]), JSON.parse(m[2]!) as Record<string, unknown>]));
}

const text = (pieces: Iterable<HtmlPiece>): string => [...pieces].filter((p) => typeof p === 'string').join('');

/** A host claimed by the page, with its slice filled. */
function host(dom: SsrDom, parent: ReturnType<SsrDom['element']>, tag: string, values: readonly unknown[]): void {
  const el = dom.element(tag);
  dom.append(parent, el);
  dom.claim(el);
  dom.stateOf(el, values);
}

describe('PageParts — the format of a part (criterion 12)', () => {
  it('part 0 opens the body, then its block, then what it built, then the marker; `cut` ends in FLUSH', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const main = dom.element('main');
    dom.append(body, main);
    dom.append(main, dom.text('a'));
    const parts = new PageParts(dom, body, { first: { route: 'r' }, fields: false });
    const cut = [...parts.cut(main)];
    expect(cut.at(-1)).toBe(FLUSH);
    expect(cut.filter((p) => p === FLUSH)).toHaveLength(1);
    expect(text(cut)).toBe(`<body><script type="application/json" data-fud-part="0">{"route":"r"}</script><main>a${PART_END}`);
  });

  it('the parts and the end, joined, are the whole body, with one marker per part', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const main = dom.element('main');
    dom.append(body, main);
    dom.append(main, dom.text('a'));
    const parts = new PageParts(dom, body, { first: {}, fields: false });
    const first = text(parts.cut(main));
    const p = dom.element('p');
    dom.append(main, p);
    dom.append(p, dom.text('b'));
    const last = text(parts.end());
    expect(first).toBe(`<body><main>a${PART_END}`);
    expect(last.match(/<!--fud-end-->/gu)).toHaveLength(1);
    // The last part keeps only the `<body>` open: its marker goes before the body's close.
    expect(last.endsWith(`</main>${PART_END}</body>`)).toBe(true);
    expect((first + last).replaceAll(PART_END, '')).toBe(renderToString(body));
  });

  it('the marker goes right after the part: an element finished before the cut is closed', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const main = dom.element('main');
    dom.append(body, main);
    const area = dom.element('textarea');
    dom.append(main, area);
    dom.append(area, dom.text('x'));
    const style = dom.element('style');
    dom.append(main, style);
    dom.append(style, dom.text('p{}'));
    const parts = new PageParts(dom, body, { first: {}, fields: false });
    // The page goes on appending in `<main>`: the `<style>` before it is finished.
    const first = text(parts.cut(main));
    expect(first).toBe(`<body><main><textarea>x</textarea><style>p{}</style>${PART_END}`);
    dom.append(main, dom.text('y'));
    const last = text(parts.end());
    expect((first + last).replaceAll(PART_END, '')).toBe(renderToString(body));
  });

  it('a part with nothing to say writes no block, and only part 0 carries the static maps', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const parts = new PageParts(dom, body, { first: { tree: [1], route: 'r' }, fields: true });
    expect([...blocks(text(parts.cut(body))).keys()]).toEqual([0]);
    dom.append(body, dom.element('i'));
    const html = text(parts.cut(body)) + text(parts.end());
    expect(html).not.toContain('data-fud-part');
    expect(html.match(/<!--fud-end-->/gu)).toHaveLength(2);
  });

  it('each block holds the state of what its part claimed, and the ids keep counting', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    host(dom, body, 'x-a', [1, 2]);
    const parts = new PageParts(dom, body, { first: {}, fields: false });
    const p0 = text(parts.cut(body));
    host(dom, body, 'x-b', ['b']);
    host(dom, body, 'x-c', []);
    const p1 = text(parts.cut(body));
    const p2 = text(parts.end());

    expect(blocks(p0).get(0)).toEqual({ state: [0, [0, 2], [1, 2]] });
    expect(blocks(p1).get(1)).toEqual({ state: [1, [0, 1, 1], ['b']] });
    expect(blocks(p2).size).toBe(0);
    expect(p1).toContain('<x-b data-fud-id="1">');
    expect(p1).toContain('<x-c data-fud-id="2">');
  });

  it('the fields go in the block of the part that awaited them, and only there', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const parts = new PageParts(dom, body, { first: {}, fields: true });
    text(parts.cut(body));
    parts.field('users', { ok: ['Ana'] });
    parts.field('stats', { error: { status: 404, title: 'Not Found' }, cause: new Error('gone') });
    const p1 = text(parts.cut(body));
    const p2 = text(parts.end());
    // The cause stays on the server: only the `Problem` travels.
    expect(blocks(p1).get(1)).toEqual({
      fields: { users: { ok: ['Ana'] }, stats: { error: { status: 404, title: 'Not Found' } } },
    });
    expect(p2).not.toContain('data-fud-part');
  });

  it('a route that does not publish its data publishes no fields either', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const parts = new PageParts(dom, body, { first: {}, fields: false });
    text(parts.cut(body));
    parts.field('users', { ok: ['Ana'] });
    expect(text(parts.end())).not.toContain('data-fud-part');
  });

  it('a block that would close the script is escaped', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const parts = new PageParts(dom, body, { first: { data: '</script>' }, fields: false });
    expect(text(parts.cut(body))).not.toContain('"</script>"');
  });
});

describe('PageParts — the container, part by part (§3.5)', () => {
  it('writes the map when it grew, whole; and the seed with only its new keys', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    const root = iocRoot();
    const parts = new PageParts(dom, body, { first: {}, fields: false, ioc: root });
    // Nothing below the root and nothing published: no `ioc`, no `di`, no block at all.
    expect(text(parts.cut(body))).not.toContain('data-fud-part');

    root.child('x-a');
    publishIn(root, token<string>('locale'), 'es');
    expect(blocks(text(parts.cut(body))).get(1)).toEqual({ ioc: [[-1, 0], ['', 'x-a']], di: { locale: 'es' } });

    // The same map and the same seed: nothing again.
    expect(text(parts.cut(body))).not.toContain('data-fud-part');

    root.child('x-b');
    publishIn(root, token<number>('n'), 3);
    expect(blocks(text(parts.end())).get(3)).toEqual({ ioc: [[-1, 0, 0], ['', 'x-a', 'x-b']], di: { n: 3 } });
  });
});

describe('PageParts through htmlToByteStream (criterion 9)', () => {
  it('a cut leaves as a chunk of its own before the page waits, well under 8 KB', async () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    dom.append(body, dom.text('first'));
    const parts = new PageParts(dom, body, { first: {}, fields: false });
    let release!: () => void;
    const later = new Promise<void>((r) => {
      release = r;
    });
    let waited = false;
    const stream = htmlToByteStream(
      (async function* () {
        yield '<!DOCTYPE html><html><head></head>';
        yield* parts.cut(body);
        await later;
        waited = true;
        dom.append(body, dom.text('second'));
        yield* parts.end();
        yield '</html>';
      })(),
    );
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(waited).toBe(false);
    expect(decoder.decode(first.value)).toBe(`<!DOCTYPE html><html><head></head><body>first${PART_END}`);
    release();
    const second = await reader.read();
    expect(decoder.decode(second.value)).toBe(`second${PART_END}</body></html>`);
    expect((await reader.read()).done).toBe(true);
  });
});

describe('SsrDom.hydrationPart', () => {
  it('hands each slice out once, from the first id not yet sent', () => {
    const dom = new SsrDom();
    const body = dom.element('body');
    host(dom, body, 'x-a', ['a']);
    expect(dom.hydrationPart()).toEqual({ first: 0, offsets: [0, 1], data: ['a'] });
    expect(dom.hydrationPart()).toEqual({ first: 1, offsets: [0], data: [] });
    host(dom, body, 'x-b', ['b', 'c']);
    expect(dom.hydrationPart()).toEqual({ first: 1, offsets: [0, 2], data: ['b', 'c'] });
    // The whole state is still the whole state.
    expect(dom.hydrationState()).toEqual({ offsets: [0, 1, 3], data: ['a', 'b', 'c'] });
  });
});
