/**
 * BUG-31 — the anchors a `@code` statement carries into the source map.
 *
 * One anchor per fragment finds the fragment and nothing else. A debugger breaks on a LINE
 * and resolves a variable by NAME, so a statement with a single mapping has exactly one line
 * you can stop on and no names at all: `function inc() {` whose body never gets an anchor
 * cannot be stepped into, and `n()` typed in the console resolves against the GENERATED
 * scope, where `n` means whatever the minifier put there.
 *
 * The half that can be wrong without anything failing is the SPLICE offset. The emitted text
 * is not the source text — `inject(Cart)` became `injectFrom($ioc, Cart)`, a tracked read
 * became a call — so an anchor's `at` is its position in the COPY while its `src` is its
 * position in the ORIGINAL. Measure both on the same text and the map still parses, still
 * resolves, and points at the wrong column for the rest of the statement.
 */
import { describe, expect, it } from 'vitest';
import { extractCode } from '../../src/emit/oxc-code.js';
import type { ComponentDocument } from '../../src/document/index.js';
import { parse } from './_support.js';

const componentDoc = (source: string): ComponentDocument => {
  const doc = parse(source);
  if (doc.type !== 'component-document') throw new Error('expected a component document');
  return doc;
};

const wrap = (code: string): string =>
  `${code}<m-el>\n  <template shadowrootmode="open"><span></span></template>\n</m-el>\n`;

/** The `@client` statements of a `@code` block, with the anchors they carry. */
function clientBody(code: string): ReturnType<typeof extractCode>['client']['body'] {
  const source = wrap(code);
  return extractCode(source, componentDoc(source)).client.body;
}

/** A `@code` block whose `@client` region holds `body`. */
const clientCode = (body: string): string => `@code {\n  @client {\n${body}  }\n}\n`;

describe('one anchor per line, so every line is breakpointable', () => {
  it('anchors the start of each line of a multi-line statement', () => {
    const [statement] = clientBody(
      clientCode('    function inc(n) {\n      return n + 1;\n    }\n'),
    );
    const anchors = statement!.anchors;
    // Three lines of text: the statement itself (anchored by the fragment) and the two line
    // starts after it. Each `at` is the offset just past a newline in the emitted text.
    const lineStarts = anchors.filter((a) => a.name === undefined);
    expect(lineStarts.length).toBeGreaterThanOrEqual(2);
    for (const a of lineStarts) {
      expect(statement!.text[a.at - 1]).toBe('\n');
    }
  });

  it('gives a one-line statement no line-start anchor at all', () => {
    const [statement] = clientBody(clientCode('    const total = 1;\n'));
    expect(statement!.anchors.every((a) => a.name !== undefined)).toBe(true);
  });
});

describe('an anchor per identifier, with its name', () => {
  it('names the bindings the author wrote', () => {
    const [statement] = clientBody(clientCode('    const total = base + extra;\n'));
    const names = statement!.anchors.map((a) => a.name).filter((n) => n !== undefined);
    expect(names).toEqual(['total', 'base', 'extra']);
  });

  it('leaves the reserved words out: they are not bindings to resolve', () => {
    const [statement] = clientBody(
      clientCode('    function f() {\n      const x = typeof null;\n      return x;\n    }\n'),
    );
    const names = statement!.anchors.map((a) => a.name).filter((n) => n !== undefined);
    for (const word of ['function', 'const', 'typeof', 'null', 'return']) {
      expect(names).not.toContain(word);
    }
    expect(names).toContain('f');
    expect(names).toContain('x');
  });

  it('points each name at the offset the author wrote it at', () => {
    const source = wrap(clientCode('    const total = base;\n'));
    const [statement] = extractCode(source, componentDoc(source)).client.body;
    for (const a of statement!.anchors) {
      if (a.name === undefined) continue;
      expect(source.slice(a.src, a.src + a.name.length)).toBe(a.name);
    }
  });
});

describe('the anchors come out sorted by generated offset', () => {
  it('line starts and identifiers interleave in one increasing run', () => {
    const [statement] = clientBody(
      clientCode('    const a = 1;\n'),
    );
    const ats = statement!.anchors.map((a) => a.at);
    expect([...ats].sort((x, y) => x - y)).toEqual(ats);
  });

  it('and still do when a statement has several lines and several names', () => {
    const [statement] = clientBody(
      clientCode('    function inc(n) {\n      const m = n + 1;\n      return m;\n    }\n'),
    );
    const ats = statement!.anchors.map((a) => a.at);
    expect([...ats].sort((x, y) => x - y)).toEqual(ats);
  });
});

describe('the splice offset — the map that lies without failing', () => {
  const DI = `@code {
  @client {
    import { inject } from '@fudic/di';
    import { Cart } from './cart.js';

    const cart = inject(Cart);
    const total = cart.total;
  }
}
`;

  it('the emitted text really is longer than the source it came from', () => {
    // `inject(Cart)` → `injectFrom($ioc, Cart)`: everything after it has moved.
    const source = wrap(DI);
    const body = extractCode(source, componentDoc(source)).client.body;
    const injected = body.find((s) => s.text.includes('injectFrom'))!;
    expect(injected.text).toContain('injectFrom($ioc, Cart)');
    expect(injected.splices.length).toBeGreaterThan(0);
  });

  it('every anchor’s `src` points at its own name in the ORIGINAL, after a splice', () => {
    // This is the assertion that catches measuring on the copy: `at` moves with the splice,
    // `src` must not. Read the name back out of the source at `src` and it has to be there.
    const source = wrap(DI);
    const body = extractCode(source, componentDoc(source)).client.body;
    const injected = body.find((s) => s.text.includes('injectFrom'))!;
    for (const a of injected.anchors) {
      if (a.name === undefined) continue;
      expect(source.slice(a.src, a.src + a.name.length)).toBe(a.name);
    }
  });

  it('and the `at` of a name AFTER the splice finds it in the emitted copy', () => {
    // `Cart` is the case: in the source it sits at `inject(Cart)`, in the copy at
    // `injectFrom($ioc, Cart)` — ten characters further along. Measuring `at` on the copy
    // instead of on the source plus the splices moves it back onto `$ioc`, and the map
    // still parses, still resolves, and names the wrong thing.
    const source = wrap(DI);
    const body = extractCode(source, componentDoc(source)).client.body;
    const injected = body.find((s) => s.text.includes('injectFrom'))!;
    const cart = injected.anchors.find((a) => a.name === 'Cart')!;
    expect(injected.text.slice(cart.at, cart.at + 4)).toBe('Cart');
    expect(source.slice(cart.src, cart.src + 4)).toBe('Cart');
    // And the two really are different offsets, or the assertion above proves nothing.
    expect(cart.at).not.toBe(cart.src - injected.at);
  });

  it('a statement AFTER the spliced one is measured from its own start, unmoved', () => {
    const source = wrap(DI);
    const body = extractCode(source, componentDoc(source)).client.body;
    const after = body.find((s) => s.text.startsWith('const total'))!;
    expect(after.splices).toEqual([]);
    for (const a of after.anchors) {
      if (a.name === undefined) continue;
      expect(after.text.slice(a.at, a.at + a.name.length)).toBe(a.name);
      expect(source.slice(a.src, a.src + a.name.length)).toBe(a.name);
    }
  });
});

describe('what carries no anchors, and why', () => {
  it('a hoisted import has none: its text is rebuilt, not sliced', () => {
    const source = wrap(
      '@code {\n  import { Cart } from \'./cart.js\';\n  const total = Cart.zero;\n}\n',
    );
    const { neutral } = extractCode(source, componentDoc(source));
    expect(neutral.find((s) => s.hoisted)!.anchors).toEqual([]);
  });
});
