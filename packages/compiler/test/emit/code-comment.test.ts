/**
 * BUG-13 — a Razor comment inside `@code` wipes the whole block.
 *
 * `@* … *@` is Fudic syntax, not JavaScript, so it must never reach the Oxc batch. It did:
 * the neutral chunk was emitted as one continuous span, comment included, Oxc rejected the
 * batch — which is ONE per file — and every part fell with it: props, signals and the
 * `@client` body. Silently, because `extractCode` dropped the batch diagnostics.
 *
 * The three positions are asserted separately even though the cause is shared: the batch is
 * single, so a fix that only handles the neutral zone would still lose a comment written
 * inside `@client`.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
} from '../../src/emit/index.js';
import { extractCode } from '../../src/emit/oxc-code.js';
import type { ComponentDocument } from '../../src/document/index.js';
import { memoryIo, parse } from './_support.js';

const TAG = 'app-x';

/** A component whose markup reads `count`, so a lost signal shows up as broken output. */
const component = (code: string): string =>
  `@code {\n${code}\n}\n` +
  `<${TAG}>\n  <template shadowrootmode="open"><p>@(count.peek())</p></template>\n</${TAG}>\n`;

const componentDoc = (source: string): ComponentDocument => {
  const doc = parse(source);
  if (doc.type !== 'component-document') throw new Error('expected a component document');
  return doc;
};

/** The SSR module and the client chunk of one in-memory component, the way the plugin builds them. */
function emitBoth(source: string): { module: string; chunk: string } {
  const io = memoryIo({
    '/page.fud':
      `<link rel="component" href="./${TAG}.fud">\n` +
      `<html><head></head><body><${TAG}></${TAG}></body></html>\n`,
    [`/${TAG}.fud`]: source,
  });
  const graph = resolveComponents('/page.fud', io);
  const comp = graph.components.get(TAG)!;
  return {
    module: emitComponentModule(graph, comp),
    chunk: emitComponentClientModule(graph, comp),
  };
}

const CLIENT = '  @client {\n    const count = signal(0);\n  }';

const positions: ReadonlyArray<readonly [string, string]> = [
  ['before @client', `  @* c *@\n${CLIENT}`],
  ['inside @client', '  @client {\n    @* c *@\n    const count = signal(0);\n  }'],
  ['after @client', `${CLIENT}\n  @* c *@`],
];

describe('BUG-13 — a Razor comment in @code (§6.1, §6.2)', () => {
  const clean = emitBoth(component(CLIENT));

  it('emits the inert signal and the client signal with no comment at all (the baseline)', () => {
    expect(clean.module).toContain('const count = { peek: () => (0) };');
    expect(clean.chunk).toContain('const count = signal(0);');
  });

  for (const [where, code] of positions) {
    it(`survives a comment ${where}`, () => {
      const out = emitBoth(component(code));
      expect(out.module).toContain('const count = { peek: () => (0) };');
      expect(out.chunk).toContain('const count = signal(0);');
    });
  }

  it('keeps props<T>() too — the batch is one, so it falls whole or not at all (§6.5)', () => {
    const source = component(
      '  @* c *@\n' +
        '  const { label } = props<{ label: string }>();\n' +
        `${CLIENT}`,
    );
    const out = emitBoth(source);
    expect(out.module).toContain('const { label } = props ?? {};');
    expect(out.module).toContain('const count = { peek: () => (0) };');
    expect(out.chunk).toContain('label');
  });

  it('is not fooled by braces or an @client written INSIDE the comment (§6.4)', () => {
    const source = component(
      '  @* deja una { abierta, un } suelto y un @client { que no lo es *@\n' + `${CLIENT}`,
    );
    const out = emitBoth(source);
    expect(out.module).toContain('const count = { peek: () => (0) };');
    expect(out.chunk).toContain('const count = signal(0);');
    // The comment is not a region: exactly one `@client` was found, the real one.
    expect(out.chunk.match(/const count = signal\(0\);/gu)).toHaveLength(1);
  });
});

describe('BUG-13 — a failed parse is not an empty parse (§6.3)', () => {
  it('reports a diagnostic, with its span inside the block, for JS that is really broken', () => {
    const source = component('  const = ;');
    const doc = componentDoc(source);
    const { diagnostics } = extractCode(source, doc);
    expect(diagnostics.length).toBeGreaterThan(0);
    const block = doc.code!.span;
    for (const d of diagnostics) {
      expect(d.span.start).toBeGreaterThanOrEqual(block.start);
      expect(d.span.end).toBeLessThanOrEqual(block.end);
    }
  });

  it('says nothing when the JS is fine — empty means "there was no code"', () => {
    expect(extractCode(component(CLIENT), componentDoc(component(CLIENT))).diagnostics).toEqual([]);
  });
});
