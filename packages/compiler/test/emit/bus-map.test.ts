/**
 * `fud-bus` — directed hydration, by tag (SDD-15 §3.5, §4.4; criteria §6.21, the other half
 * of §6.22).
 *
 * The emitter and the subscriber are siblings that do not know each other. What the map
 * says is an ORDER: to bring the emitter up, bring its subscribers up first, or the first
 * event fires into a page where nobody is listening yet. The name of the event does not
 * survive into the output — it was resolved here.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  resolveComponents,
  emitComponentClientModule,
  emitPageModule,
} from '../../src/emit/index.js';
import { fudBus } from '../../src/emit/maps.js';
import { fixturesDir, fixtureIo, memoryIo } from './_support.js';

/** A page linking the given components, with one instance of each. */
function home(tags: readonly string[]): string {
  const links = tags.map((t) => `<link rel="component" href="./${t}.fud">`).join('\n    ');
  const body = tags.map((t) => `<${t}></${t}>`).join('');
  return `<!DOCTYPE html>
<html>
  <head>
    ${links}
  </head>
  <body>${body}</body>
</html>
`;
}

/** A component that emits: `@client` with `emit` imported from `@fudic/dom`. */
function emitter(tag: string, body: string): string {
  return `@code {
  @client {
    import { emit } from '@fudic/dom';
${body}
  }
}
<${tag}>
  <template shadowrootmode="open">
    <button @click="@go">go</button>
  </template>
</${tag}>
`;
}

/** A component that listens on the bus. */
function listener(tag: string, markup: string): string {
  return `<${tag}>
  <template shadowrootmode="open">
${markup}
  </template>
</${tag}>
`;
}

const busOf = (files: Record<string, string>): Record<string, readonly string[]> =>
  fudBus(resolveComponents('/app/home.fud', memoryIo(files)));

describe('fud-bus — the canonical pair (§6.21)', () => {
  it('the emitter of a name depends on every tag that listens to it', () => {
    expect(
      busOf({
        '/app/home.fud': home(['product-list', 'shopping-cart']),
        '/app/product-list.fud': emitter(
          'product-list',
          `    function go(p) {
      emit('carrito', p);
    }`,
        ),
        '/app/shopping-cart.fud': listener(
          'shopping-cart',
          '    <ul bus:carrito="@onCarrito($event)"></ul>',
        ),
      }),
    ).toEqual({ 'product-list': ['shopping-cart'] });
  });

  it('the page module carries it as a compile-time constant', () => {
    const graph = resolveComponents(
      '/app/home.fud',
      memoryIo({
        '/app/home.fud': home(['product-list', 'shopping-cart']),
        '/app/product-list.fud': emitter(
          'product-list',
          `    function go(p) {
      emit('carrito', p);
    }`,
        ),
        '/app/shopping-cart.fud': listener(
          'shopping-cart',
          '    <ul bus:carrito="@onCarrito($event)"></ul>',
        ),
      }),
    );
    expect(emitPageModule(graph)).toContain('const FUD_BUS = {"product-list":["shopping-cart"]};');
  });

  it('two subscribers of the same name are both dependencies, once each', () => {
    expect(
      busOf({
        '/app/home.fud': home(['product-list', 'shopping-cart', 'cart-badge']),
        '/app/product-list.fud': emitter(
          'product-list',
          `    function go(p) {
      emit('carrito', p);
      emit('carrito', p);
    }`,
        ),
        // Two `bus:carrito` on two elements of the same template: one tag, listed once.
        '/app/shopping-cart.fud': listener(
          'shopping-cart',
          '    <ul bus:carrito="@a($event)"></ul>\n    <p bus:carrito="@b($event)"></p>',
        ),
        '/app/cart-badge.fud': listener('cart-badge', '    <b bus:carrito="@c($event)"></b>'),
      }),
    ).toEqual({ 'product-list': ['shopping-cart', 'cart-badge'] });
  });

  it('a subscriber reached through two different names is listed once', () => {
    expect(
      busOf({
        '/app/home.fud': home(['product-list', 'shopping-cart']),
        '/app/product-list.fud': emitter(
          'product-list',
          `    function go(p) {
      emit('added', p);
      emit('removed', p);
    }`,
        ),
        '/app/shopping-cart.fud': listener(
          'shopping-cart',
          '    <ul bus:added="@a($event)" bus:removed="@b($event)"></ul>',
        ),
      }),
    ).toEqual({ 'product-list': ['shopping-cart'] });
  });

  it('an event nobody listens to produces no entry', () => {
    expect(
      busOf({
        '/app/home.fud': home(['product-list']),
        '/app/product-list.fud': emitter(
          'product-list',
          `    function go() {
      emit('nadie');
    }`,
        ),
      }),
    ).toEqual({});
  });
});

describe('fud-bus — the edge with itself', () => {
  it('app-actions emits `cleared` and listens to it, and does not list itself', () => {
    // `{"app-actions":["app-actions"]}` would tell the runtime that raising A needs A first.
    const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
    expect(fudBus(graph)).toEqual({});
  });

  it('a self-emitter that another tag also listens to keeps only the other', () => {
    expect(
      busOf({
        '/app/home.fud': home(['x-loop', 'x-other']),
        '/app/x-loop.fud': `@code {
  @client {
    import { emit } from '@fudic/dom';

    function go() {
      emit('ping');
    }
  }
}
<x-loop>
  <template shadowrootmode="open">
    <ul bus:ping="@own($event)"></ul>
  </template>
</x-loop>
`,
        '/app/x-other.fud': listener('x-other', '    <b bus:ping="@p($event)"></b>'),
      }),
    ).toEqual({ 'x-loop': ['x-other'] });
  });
});

describe('fud-bus — what does not resolve does not participate (§6.22)', () => {
  it('an emit whose name is an expression produces no entry and no diagnostic', () => {
    const files = {
      '/app/home.fud': home(['product-list', 'shopping-cart']),
      '/app/product-list.fud': emitter(
        'product-list',
        `    const EVENTOS = { carrito: 'carrito' };

    function go(p) {
      emit(EVENTOS.carrito, p);
    }`,
      ),
      '/app/shopping-cart.fud': listener(
        'shopping-cart',
        '    <ul bus:carrito="@onCarrito($event)"></ul>',
      ),
    };
    const graph = resolveComponents('/app/home.fud', memoryIo(files));
    expect(fudBus(graph)).toEqual({});
    // And the listener is still emitted: the chunk of the emitter carries its `emit.call`,
    // and the subscriber its `$dom.bus(...)`. We do not protect what we cannot see.
    expect(emitComponentClientModule(graph, graph.components.get('product-list')!)).toContain(
      'emit.call($host, EVENTOS.carrito, p)',
    );
    expect(emitComponentClientModule(graph, graph.components.get('shopping-cart')!)).toContain(
      "$dom.bus($host, \"carrito\"",
    );
  });

  it('a `bus:(EXPR)` subscriber does not enter the map either', () => {
    expect(
      busOf({
        '/app/home.fud': home(['product-list', 'shopping-cart']),
        '/app/product-list.fud': emitter(
          'product-list',
          `    function go(p) {
      emit('carrito', p);
    }`,
        ),
        '/app/shopping-cart.fud': listener(
          'shopping-cart',
          `    <ul bus:(EVENTOS.carrito)="@onCarrito($event)"></ul>`,
        ),
      }),
    ).toEqual({});
  });

  it('a component that never imports `emit` emits nothing to the bus', () => {
    // A raw `host.dispatchEvent(...)` is valid DOM and stays untouched: it does not take
    // part in directed hydration, which is exactly the distinction `emit` buys.
    expect(
      busOf({
        '/app/home.fud': home(['x-raw', 'shopping-cart']),
        '/app/x-raw.fud': `@code {
  @client {
    function go() {
      document.dispatchEvent(new CustomEvent('carrito'));
    }
  }
}
<x-raw>
  <template shadowrootmode="open">
    <button @click="@go">go</button>
  </template>
</x-raw>
`,
        '/app/shopping-cart.fud': listener(
          'shopping-cart',
          '    <ul bus:carrito="@onCarrito($event)"></ul>',
        ),
      }),
    ).toEqual({});
  });
});
