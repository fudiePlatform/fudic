/**
 * BUG-23 §5 — «the level-1 output does not move».
 *
 * Decision 103 lets a value that is one `@` expression drop its quotes. The claim the
 * grammar makes about it is that the AST is the SAME one, so migrating `.prop="@x"` to
 * `.prop=@x` cannot change a byte of what the emit writes. That is not something a golden
 * file can state — a golden fixes one spelling — so it is stated here, by compiling both
 * spellings of the same host and comparing the three outputs character for character.
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

/** A parent that declares a signal and a handler, so every spelling has something to resolve. */
const CARD = (host: string): string => `<link rel="component" href="./app-badge.fud">

@code {
  @client {
    import { signal } from '@fudic/core';
    const titulo = signal('Hola');
    const activo = signal(true);
    function onClick(ev) {}
  }
}

<app-card>
  <template shadowrootmode="open">${host}</template>
</app-card>
`;

const page = (host: string): string =>
  `<!DOCTYPE html>\n<html>\n<head><link rel="component" href="./app-card.fud"></head>\n` +
  `<body>${host}</body>\n</html>\n`;

/** The three outputs a host produces, joined: page module, server module, client chunk. */
function emitted(host: string): string {
  const io = memoryIo({
    '/page.fud': page('<app-card></app-card>'),
    '/app-card.fud': CARD(host),
    '/app-badge.fud': BADGE,
  });
  const graph: ComponentGraph = resolveComponents('/page.fud', io);
  const card = graph.components.get('app-card')!;
  return [
    emitPageModule(graph),
    emitComponentModule(graph, card),
    emitComponentClientModule(graph, card),
  ].join('\n');
}

describe('the quotes are spelling, not meaning (decision 103)', () => {
  const same = (quoted: string, bare: string): void => {
    expect(emitted(bare)).toBe(emitted(quoted));
  };

  it('a `.prop` emits the same with quotes and without', () => {
    same('<app-badge .tone="@titulo"></app-badge>', '<app-badge .tone=@titulo></app-badge>');
  });

  it('a plain interpolated attribute does too', () => {
    same('<div id="@titulo"></div>', '<div id=@titulo></div>');
  });

  it('and so does an event binding written as a call', () => {
    same('<div @click="@onClick($event)"></div>', '<div @click=@onClick($event)></div>');
  });

  it('and a `class:` binding', () => {
    same('<span class:on="@activo"></span>', '<span class:on=@activo></span>');
  });
});

describe('the dangling dot is annotated, not consumed (decision 102)', () => {
  it('still comes out as literal text, so decision 2 is intact', () => {
    // `@titulo.` is the interpolation `titulo` followed by a literal `.`. The editor gets
    // the dot through `dangling`; the emit never sees it, and the output proves it.
    // The run coalesces into one text node, so the dot rides beside the interpolation.
    expect(emitted('<div>@titulo.</div>')).toContain("$dom.text(`${(titulo) ?? ''}.`)");
  });
});

describe('the crossing rule did not move with `crossing` (criterion 5.b)', () => {
  it('still crosses the READ of a reactive, in both spellings', () => {
    for (const host of [
      '<app-badge .tone="@titulo"></app-badge>',
      '<app-badge .tone=@titulo></app-badge>',
    ]) {
      const src = emitted(host);
      expect(src).toContain('titulo()');
      // The object itself never crosses: that is what would paint `[object Object]`.
      expect(src).not.toMatch(/"tone": titulo[^(]/u);
    }
  });
});
