/**
 * BUG-13, the emit half — a `@code` that does not parse is not a `@code` that was empty.
 *
 * `extractCode` used to call `batch.parse()` and drop `result.diagnostics` on the floor. A
 * failed parse then looked exactly like a component with no code at all, so the emit wrote
 * a syntactically valid module referencing identifiers nobody declares, and the failure
 * surfaced as a `ReferenceError` in the prerender, in a file that never mentioned the cause.
 *
 * The Razor comment that started all this is now FUD0114 at parse time (see
 * `test/code/code.test.ts`); what is asserted here is the other half of the decision: the
 * JavaScript comment that replaces it loses nothing.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitComponentModuleMapped,
  emitComponentClientModuleMapped,
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

/** The SSR module and the client chunk of one in-memory component, as the plugin builds them. */
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

describe('BUG-13 — a JS comment in @code costs nothing (§7.6)', () => {
  const positions: ReadonlyArray<readonly [string, string]> = [
    ['in the neutral zone', `  // c\n  /* c */\n${CLIENT}`],
    ['inside @client', '  @client {\n    // c\n    /* c */\n    const count = signal(0);\n  }'],
    ['after @client', `${CLIENT}\n  // c`],
  ];

  for (const [where, code] of positions) {
    it(`keeps the inert signal and the client signal — comment ${where}`, () => {
      const out = emitBoth(component(code));
      expect(out.module).toContain('const count = { peek: () => (0) };');
      expect(out.chunk).toContain('const count = signal(0);');
    });
  }

  it('keeps props<T>() too — the batch is one, so it stands or falls whole (§7.6)', () => {
    const source = component(
      '  // c\n  const { label } = props<{ label: string }>();\n' + `${CLIENT}`,
    );
    const out = emitBoth(source);
    expect(out.module).toContain('const { label } = props ?? {};');
    expect(out.module).toContain('const count = { peek: () => (0) };');
    expect(out.chunk).toContain('label');
  });
});

describe('BUG-13 — a failed parse is not an empty parse (§7.3)', () => {
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
    const source = component(CLIENT);
    expect(extractCode(source, componentDoc(source)).diagnostics).toEqual([]);
  });

  it('says nothing for a component with no @code at all', () => {
    const source = `<${TAG}>\n  <template shadowrootmode="open"><span></span></template>\n</${TAG}>\n`;
    expect(extractCode(source, componentDoc(source)).diagnostics).toEqual([]);
  });

  it('carries the diagnostics out of the emit, so a build can stop on them (§7.3)', () => {
    const io = memoryIo({
      '/page.fud':
        `<link rel="component" href="./${TAG}.fud">\n` +
        `<html><head></head><body><${TAG}></${TAG}></body></html>\n`,
      [`/${TAG}.fud`]: component('  const = ;'),
    });
    const graph = resolveComponents('/page.fud', io);
    const comp = graph.components.get(TAG)!;
    expect(emitComponentModuleMapped(graph, comp).diagnostics.length).toBeGreaterThan(0);
    expect(emitComponentClientModuleMapped(graph, comp).diagnostics.length).toBeGreaterThan(0);
  });
});
