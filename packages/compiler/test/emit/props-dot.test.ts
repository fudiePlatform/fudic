/**
 * BUG-16, as BUG-32 left it — a property written with a dot reaches the CHILD, and only
 * the child.
 *
 * In fudic a property of a component is written with a `.`, and that is the only way to
 * write one. BUG-16 made it reach the output by reflecting it on the host besides, and
 * BUG-32 took that back: the prop travels by `render` on the server and by the cell on
 * the client, so the attribute was a second copy of the same value that nobody read and
 * that `$a()` rewrote on every update.
 *
 * What is asserted here is therefore the pair: the value still crosses, and the host is
 * NOT where it crosses. Reflecting a prop is still available, spelled as what it is — a
 * plain attribute with an expression — and that case lives in `host-bindings.test.ts`.
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

describe('a `.prop` on a component host reaches the CHILD, not the host (BUG-32 T1)', () => {
  it('writes no attribute for a static value, in any of the three outputs', () => {
    for (const src of all('<app-badge .tone="info"></app-badge>')) {
      expect(src).not.toMatch(/setAttr\([^)]*"tone"/u);
    }
  });

  it('still hands the value to the child render on the server (SSR paints it)', () => {
    const { page: p, server } = outputs('<app-badge .tone="info"></app-badge>');
    expect(p).toContain('{ "tone": "info" }');
    expect(server).toContain('{ "tone": "info" }');
  });

  it('still hands it to the child cell on the client', () => {
    const { client } = outputs('<app-badge .tone="info"></app-badge>');
    expect(client).toMatch(/\$live\(\$n\d+, \["info"\]\);/u);
  });

  it('writes no attribute for an interpolated value either, and drops the omit-if-falsy branch', () => {
    for (const src of all('<app-badge .tone="@(t)"></app-badge>')) {
      expect(src).not.toMatch(/setAttr\([^)]*"tone"/u);
      // The whole reflect machinery goes with it: no `$v` triple for this binding.
      expect(src).not.toMatch(/if \(\$v === true\) \$dom\.setAttr\(\$n\d+, "tone", ''\);/u);
    }
  });
});

describe('a bare `.prop` is `true` (decision 44)', () => {
  it('crosses as true, and writes no attribute at all', () => {
    const { page: p, server, client } = outputs('<app-badge .featured></app-badge>');
    for (const src of [p, server, client]) {
      expect(src).not.toMatch(/setAttr\([^)]*"featured"/u);
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
  });

  it('a bare `.prop` beside a signal still crosses as true, and neither reaches the host', () => {
    const { server, client } = withSignal('<app-badge .tone="@count" .featured></app-badge>');
    expect(server).toContain('{ "tone": count(), "featured": true }');
    // The client payload carries the signal read at hookup...
    expect(client).toMatch(/\.u\(\[, , [^\]]*count\(\)[^\]]*\]\)/u);
    // ...and nothing at all is written on the host itself.
    expect(client).not.toMatch(/setAttr\([^)]*"(tone|featured)"/u);
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
