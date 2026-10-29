import { describe, it, expect } from 'vitest';
import { SsrDom } from '../src/ssr-dom.js';
import { renderToString, serializeChunks } from '../src/serialize.js';
import { FLUSH, htmlToByteStream, renderToStream, type HtmlPiece } from '../src/stream.js';

/** The canonical mixed tree of SDD-14 §6.3. */
function canonicalTree(d: SsrDom) {
  const div = d.element('div');
  d.append(div, d.text('a<b'));
  d.append(div, d.element('img'));
  const style = d.element('style');
  d.append(style, d.text('.x{}'));
  d.append(div, style);
  return div;
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return chunks;
    }
    chunks.push(value);
  }
}

function decodeAll(chunks: Uint8Array[]): string {
  const decoder = new TextDecoder();
  return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
}

interface SourceState {
  consumed: number;
  finished: boolean;
}

function* countingPieces(pieces: string[], state: SourceState): Generator<string> {
  try {
    for (const piece of pieces) {
      state.consumed += 1;
      yield piece;
    }
  } finally {
    state.finished = true;
  }
}

const tick = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('serializeChunks (SDD-16 §6.3)', () => {
  it('joined, equals renderToString for the canonical tree', () => {
    const d = new SsrDom();
    const div = canonicalTree(d);
    expect([...serializeChunks(div)].join('')).toBe(renderToString(div));
  });

  it('joined, equals renderToString for a DSD host', () => {
    const d = new SsrDom();
    const host = d.element('app-x');
    d.setAttr(host, 'data-fud-adopt', 'app-x');
    const root = d.attachShadow(host);
    d.append(root, d.text('hi'));
    d.append(host, d.text('light'));
    expect([...serializeChunks(host)].join('')).toBe(renderToString(host));
    expect(renderToString(host)).toBe(
      '<app-x data-fud-adopt="app-x"><template shadowrootmode="open" shadowrootadoptedstylesheets="app-x">hi</template>light</app-x>',
    );
  });

  it('is lazy: the first piece comes out before the tree is walked', () => {
    const d = new SsrDom();
    const div = canonicalTree(d);
    const walk = serializeChunks(div);
    expect(walk.next().value).toBe('<div>');
  });
});

describe('renderToStream (SDD-16 §6.4)', () => {
  it('produces the same bytes as renderToString, in more than one chunk', async () => {
    const d = new SsrDom();
    const div = canonicalTree(d);
    const chunks = await collect(renderToStream(div, { highWaterMark: 16 }));
    expect(chunks.length).toBeGreaterThan(1); // real streaming, not one blob
    expect(decodeAll(chunks)).toBe(renderToString(div));
  });

  it('defaults coalesce a small tree into a single chunk', async () => {
    const d = new SsrDom();
    const div = canonicalTree(d);
    const chunks = await collect(renderToStream(div));
    expect(chunks.length).toBe(1);
    expect(decodeAll(chunks)).toBe(renderToString(div));
  });
});

describe('htmlToByteStream (SDD-16 §6.5)', () => {
  it('respects backpressure: a slow consumer does not exhaust the source at once', async () => {
    const pieces = Array.from({ length: 20 }, (_, i) => `<i>${i}</i>`);
    const state: SourceState = { consumed: 0, finished: false };
    const stream = htmlToByteStream(countingPieces(pieces, state), { highWaterMark: 16 });
    const reader = stream.getReader();
    await tick(); // let the initial pull settle
    expect(state.consumed).toBeLessThan(pieces.length); // paused at desiredSize <= 0

    let text = '';
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
    expect(text + decoder.decode()).toBe(pieces.join(''));
    expect(state.consumed).toBe(pieces.length);
    expect(state.finished).toBe(true);
  });

  it('cancel() closes the source iterator via return()', async () => {
    const pieces = Array.from({ length: 20 }, (_, i) => `piece-${i}`);
    const state: SourceState = { consumed: 0, finished: false };
    const stream = htmlToByteStream(countingPieces(pieces, state), { highWaterMark: 16 });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();
    expect(state.finished).toBe(true);
    expect(state.consumed).toBeLessThan(pieces.length);
  });

  it('accepts an AsyncIterable (the seam the emit inherits)', async () => {
    async function* asyncPieces(): AsyncGenerator<string> {
      yield '<p>';
      await Promise.resolve();
      yield 'async';
      yield '</p>';
    }
    const chunks = await collect(htmlToByteStream(asyncPieces()));
    expect(decodeAll(chunks)).toBe('<p>async</p>');
  });

  it('an empty source produces an empty, closed stream', async () => {
    const chunks = await collect(htmlToByteStream([]));
    expect(chunks).toHaveLength(0);
  });
});

describe('htmlToByteStream — FLUSH (SDD-70 §3.6)', () => {
  const texts = (chunks: Uint8Array[]): string[] => chunks.map((c) => new TextDecoder().decode(c));

  it('a piece under 8 KB followed by FLUSH is its own chunk before the next piece is awaited', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let passedGate = false;
    async function* source(): AsyncGenerator<HtmlPiece> {
      yield '<head></head>';
      yield '<body>';
      yield FLUSH;
      await gate; // the field the page waits for
      passedGate = true;
      yield 'late</body>';
    }
    const reader = htmlToByteStream(source()).getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(new TextDecoder().decode(first.value)).toBe('<head></head><body>');
    expect(passedGate).toBe(false); // delivered while the source still waits
    release();
    const second = await reader.read();
    expect(new TextDecoder().decode(second.value)).toBe('late</body>');
    expect(passedGate).toBe(true);
    expect((await reader.read()).done).toBe(true);
  });

  it('FLUSH with an empty buffer enqueues nothing', async () => {
    expect(await collect(htmlToByteStream([FLUSH]))).toHaveLength(0);
    const chunks = await collect(htmlToByteStream([FLUSH, 'a', FLUSH, FLUSH, 'b', FLUSH]));
    expect(texts(chunks)).toEqual(['a', 'b']);
  });

  it('works with a sync iterable: FLUSH cuts where coalescing would not', async () => {
    function* pieces(): Generator<HtmlPiece> {
      yield '<a>';
      yield FLUSH;
      yield '<b>';
      yield '<c>';
    }
    expect(texts(await collect(htmlToByteStream(pieces())))).toEqual(['<a>', '<b><c>']);
  });

  it('is the shared symbol, so another copy of the module speaks to this one', () => {
    expect(FLUSH).toBe(Symbol.for('fudic.ssr.flush'));
  });

  it('without FLUSH, coalescing is unchanged: one chunk under the mark, a cut at it', async () => {
    expect(texts(await collect(htmlToByteStream(['<a>', '<b>', '<c>'])))).toEqual(['<a><b><c>']);
    expect(
      texts(await collect(htmlToByteStream(['12', '345', '6', '78'], { highWaterMark: 4 }))),
    ).toEqual(['12345', '678']);
  });
});

describe('UTF-8 chunking (SDD-16 §6.6)', () => {
  it('never splits a multi-byte code point across chunks', async () => {
    const d = new SsrDom();
    const div = d.element('div');
    for (const piece of ['a🌍b', '🚀', 'ñ€𝄞', '🇪🇸']) {
      d.append(div, d.text(piece));
    }
    const chunks = await collect(renderToStream(div, { highWaterMark: 4 }));
    expect(chunks.length).toBeGreaterThan(1);
    // A fatal, non-streaming decoder throws on any partial sequence.
    const fatal = new TextDecoder('utf-8', { fatal: true });
    const text = chunks.map((c) => fatal.decode(c)).join('');
    expect(text).toBe(renderToString(div));
  });
});
