/**
 * BUG-16 — a property written with a dot reaches the OUTPUT.
 *
 * In fudic a property of a component is written with a `.`, and that is the only way to
 * write one. Which makes the dot the thing that has to survive compilation: a prop that
 * exists only in the editor's projection is not a prop, and level 1 is HTML with no JS,
 * so the only place a value can live there is an attribute of the host.
 *
 * Written before the fix and seen to fail: today a `.prop` on a component host emits
 * NOTHING at all — not the attribute, not the props entry — which is the defect. A plain
 * attribute on a component host emits nothing either, so `slot="meta"` never reached the
 * host and the child fell into the default slot.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitPageModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const BADGE = `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}

<app-badge>
  <template shadowrootmode="open"><span>@tone</span></template>
</app-badge>
`;

/** A parent component whose template holds the host under test. */
const parent = (host: string): string => `<link rel="component" href="./app-badge.fud">

@code {
  const { t = 'info' } = props<{ t?: string }>();
}

<app-card>
  <template shadowrootmode="open">${host}</template>
</app-card>
`;

/** A page whose body holds the host under test, and which links the parent component. */
const page = (host: string, links: string): string =>
  `<!DOCTYPE html>\n<html>\n<head>${links}</head>\n<body>${host}</body>\n</html>\n`;

const BADGE_LINK = '<link rel="component" href="./app-badge.fud">';

/** Emit the three outputs a host can appear in: page, server component, client chunk. */
function outputs(host: string): { page: string; server: string; client: string } {
  const io = memoryIo({
    '/page.fud': page(host, BADGE_LINK),
    '/nested.fud': page('<app-card></app-card>', '<link rel="component" href="./app-card.fud">'),
    '/app-card.fud': parent(host),
    '/app-badge.fud': BADGE,
  });
  const pageGraph: ComponentGraph = resolveComponents('/page.fud', io);
  const cardGraph: ComponentGraph = resolveComponents('/nested.fud', io);
  const card = cardGraph.components.get('app-card')!;
  return {
    page: emitPageModule(pageGraph),
    server: emitComponentModule(cardGraph, card),
    client: emitComponentClientModule(cardGraph, card),
  };
}

/** The three outputs of a host, as one string — every assertion here holds in all three. */
const all = (host: string): readonly [string, string, string] => {
  const o = outputs(host);
  return [o.page, o.server, o.client];
};

describe('a `.prop` on a component host reaches the output (§6.1)', () => {
  it('writes a static value as an attribute of the host, dot dropped', () => {
    for (const src of all('<app-badge .tone="info"></app-badge>')) {
      expect(src).toMatch(/\$dom\.setAttr\(\$n\d+, "tone", "info"\);/u);
    }
  });

  it('still hands the value to the child render on the server (SSR paints it)', () => {
    const { page: p, server } = outputs('<app-badge .tone="info"></app-badge>');
    expect(p).toContain('{ "tone": "info" }');
    expect(server).toContain('{ "tone": "info" }');
  });

  it('writes an interpolated value through the omit-if-falsy branch (§6.2)', () => {
    for (const src of all('<app-badge .tone="@(t)"></app-badge>')) {
      expect(src).toMatch(/if \(\$v === true\) \$dom\.setAttr\(\$n\d+, "tone", ''\);/u);
      expect(src).toMatch(/else if \(\$v !== false && \$v != null\) \$dom\.setAttr\(\$n\d+, "tone", String\(\$v\)\);/u);
    }
  });
});

describe('a bare `.prop` is `true` (decision 44)', () => {
  it('crosses as true, and writes the empty attribute HTML asks for', () => {
    const { page: p, server, client } = outputs('<app-badge .featured></app-badge>');
    for (const src of [p, server, client]) {
      expect(src).toMatch(/\$dom\.setAttr\(\$n\d+, "featured", ""\);/u);
    }
    // `true` and not `""`: the prop is a value the child destructures, not markup.
    expect(p).toContain('{ "featured": true }');
    expect(server).toContain('{ "featured": true }');
  });
});

describe('a signal crosses its VALUE, never the object (decision 84)', () => {
  /** A host whose parent declares a signal, so `.prop="@count"` has something to resolve. */
  const withSignal = (host: string): { server: string; client: string } => {
    const parentWithSignal = `<link rel="component" href="./app-badge.fud">

@code {
  @client {
    import { signal } from '@fudic/core';

    const count = signal(3);
  }
}

<app-card>
  <template shadowrootmode="open">${host}</template>
</app-card>
`;
    const io = memoryIo({
      '/nested.fud': page('<app-card></app-card>', '<link rel="component" href="./app-card.fud">'),
      '/app-card.fud': parentWithSignal,
      '/app-badge.fud': BADGE,
    });
    const g = resolveComponents('/nested.fud', io);
    const card = g.components.get('app-card')!;
    return {
      server: emitComponentModule(g, card),
      client: emitComponentClientModule(g, card),
    };
  };

  it('the server paints `count()`, not the inert signal object', () => {
    const { server } = withSignal('<app-badge .tone="@count"></app-badge>');
    expect(server).toContain('{ "tone": count() }');
    expect(server).toContain('const $v = count();');
  });

  it('a bare `.prop` beside a signal still crosses as true', () => {
    const { client } = withSignal('<app-badge .tone="@count" .featured></app-badge>');
    // The payload carries both: the signal read at hookup, the constant as written.
    expect(client).toMatch(/\.u\(\[, , [^\]]*count\(\)[^\]]*\]\)/u);
    expect(client).toContain('true');
  });
});

describe('a plain attribute on a component host is an HTML attribute (§4.2)', () => {
  it('is written on the host and is NOT a prop of the child', () => {
    const { page: p, server, client } = outputs('<app-badge slot="meta"></app-badge>');
    for (const src of [p, server, client]) {
      expect(src).toMatch(/\$dom\.setAttr\(\$n\d+, "slot", "meta"\);/u);
    }
    // `slot` is HTML's own vocabulary, never a prop the child declares.
    expect(p).not.toContain('"slot": "meta"');
    expect(server).not.toContain('"slot": "meta"');
  });
});

describe('a `.prop` on a NATIVE tag is unchanged (§6.3)', () => {
  it('writes no attribute: it is client hookup, absent from SSR', () => {
    for (const src of all('<input .value="@(t)">')) {
      expect(src).not.toContain('"value"');
    }
  });
});
