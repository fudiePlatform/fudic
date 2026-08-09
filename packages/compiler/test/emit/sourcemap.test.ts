/**
 * Emit source anchors (SDD-19 §4.6): the `*Mapped` emitters return output↔source
 * pairs so a runtime error in the served JS navigates back to the `.fud`. These tests
 * prove the anchoring is BYTE-PRECISE — a mapping's generated offset lands exactly on
 * the embedded expression in the output, and its source offset lands on the same
 * expression in the `.fud` — not merely that some mappings exist.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  resolveComponents,
  emitComponentModuleMapped,
  emitPageModuleMapped,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { fixturesDir, fixtureIo } from './_support.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

describe('emitComponentModuleMapped — precise anchors (app-card)', () => {
  const comp = graph.components.get('app-card')!;
  const { code, mappings } = emitComponentModuleMapped(graph, comp);
  const source = comp.source;
  const at = (gen: number): number | undefined =>
    mappings.find((m) => m.generatedOffset === gen)?.sourceOffset;

  it('anchors an interpolation (@title) to its source offset', () => {
    // The expression text in the output sits right after this prefix.
    const gen = code.indexOf('$dom.text(String((') + '$dom.text(String(('.length;
    expect(gen).toBeGreaterThan('$dom.text(String(('.length - 1);
    const src = at(gen);
    expect(src).toBeDefined();
    expect(source.slice(src!, src! + 5)).toBe('title');
    expect(source[src! - 1]).toBe('@'); // the interpolation, not the props destructure
  });

  it('anchors an @if header to its source offset', () => {
    const gen = code.indexOf('if (expanded()) {') + 'if ('.length;
    const src = at(gen);
    expect(src).toBeDefined();
    expect(source.slice(src!, src! + 'expanded()'.length)).toBe('expanded()');
  });
});

describe('emitPageModuleMapped — anchors survive the sub-writer splice', () => {
  const { code, mappings } = emitPageModuleMapped(graph);

  it('anchors the @foreach header even though the body is spliced into the page writer', () => {
    const gen = code.indexOf('for (const item of data.items) {') + 'for ('.length;
    const src = mappings.find((m) => m.generatedOffset === gen)?.sourceOffset;
    expect(src).toBeDefined();
    expect(graph.entrySource.slice(src!, src! + 'const item of data.items'.length)).toBe(
      'const item of data.items',
    );
  });
});
