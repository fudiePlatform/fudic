/**
 * The emit reports instead of throwing (SDD-62 §8.2.2, task 23). The broken/fixed pairs found two
 * files the build could not compile: one with no host template, which the emit took for a
 * component and read a template it did not have; and a link to a file the host cannot read.
 */

import { describe, expect, it } from 'vitest';
import { emitComponentModuleMapped, entryComponent, resolveComponents, resolveDocument } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const CARD = `<app-card>
  <template shadowrootmode="open"><p>card</p></template>
</app-card>
`;

/** The emit of `source` at `/x.fud` as a component, alone in its graph. */
function emitOf(source: string): ReturnType<typeof emitComponentModuleMapped> {
  const graph = resolveComponents('/x.fud', memoryIo({ '/x.fud': source }));
  return emitComponentModuleMapped(graph, entryComponent(graph)!);
}

describe('a file with no host template emits an empty module', () => {
  it('bare markup: no throw, no code, and the structure says why', () => {
    const source = '<p>x</p>\n';
    expect(() => emitOf(source)).not.toThrow();
    expect(emitOf(source).code).toBe('');
    const codes = resolveDocument('/x.fud', memoryIo({ '/x.fud': source })).diagnostics.map((d) => d.code);
    expect(codes.length).toBeGreaterThan(0);
  });

  it('a host tag without its template: no throw, no code', () => {
    const source = '<app-x>\n  <p>x</p>\n</app-x>\n';
    expect(() => emitOf(source)).not.toThrow();
    expect(emitOf(source).code).toBe('');
  });

  it('a component with its template still emits one', () => {
    expect(emitOf(CARD).code).not.toBe('');
  });
});

describe('a link to a file the host cannot read', () => {
  const home = '<link rel="component" href="./gone.fud">\n<link rel="component" href="./app-card.fud">\n<x-home>\n  <template shadowrootmode="open"><app-card></app-card></template>\n</x-home>\n';

  it('leaves that component out of the graph, keeps the others, and does not throw', () => {
    // `memoryIo` throws on a file it does not hold, as the node host does on a missing one.
    const io = memoryIo({ '/home.fud': home, '/app-card.fud': CARD });

    expect(() => resolveComponents('/home.fud', io)).not.toThrow();
    const graph = resolveComponents('/home.fud', io);
    expect([...graph.components.keys()]).toEqual(['app-card']);
  });

  it('the whole document resolves too, and the emit of the entry runs', () => {
    const io = memoryIo({ '/home.fud': home, '/app-card.fud': CARD });

    expect(() => resolveDocument('/home.fud', io)).not.toThrow();
    const graph = resolveComponents('/home.fud', io);
    expect(emitComponentModuleMapped(graph, entryComponent(graph)!).code).toContain('app-card');
  });
});
