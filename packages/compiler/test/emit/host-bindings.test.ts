/**
 * BUG-32 T2, T3, T4 — the component's own tag carries its bindings.
 *
 * The identity tag of decision 75 is the component's markup, not a wrapper somebody else
 * writes, so what the author puts on it has to reach the output: an attribute on both
 * branches, a listener on the client one. Before this it reached neither, in silence.
 *
 * The listener is the case that hides best, and the reason this file exists. `eventHandler`
 * asks the Oxc batch for the AST of the expression, and the attributes of the identity tag
 * were never registered in that batch — so a `@click` on the host produced no listener and
 * nothing anywhere said so. It only turned up by measuring the chunk.
 *
 * `$host` is materialized only where something reads it (§4.4): a tag with no binding — which
 * is nearly every one of them — must keep the exact bytes it had.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** A component whose identity tag carries `attrs`, with `code` in front of its markup. */
function emit(attrs: string, code = ''): { server: string; client: string } {
  const io = memoryIo({
    '/page.fud':
      '<link rel="component" href="./app-host.fud">\n' +
      '<html><head></head><body><app-host></app-host></body></html>\n',
    '/app-host.fud': `${code}<app-host ${attrs}>\n  <template shadowrootmode="open"><p>hi</p></template>\n</app-host>\n`,
  });
  const graph: ComponentGraph = resolveComponents('/page.fud', io);
  const component = graph.components.get('app-host')!;
  return {
    server: emitComponentModule(graph, component),
    client: emitComponentClientModule(graph, component),
  };
}

/** A `@code { @client }` block declaring a signal and a handler. */
const CLIENT_CODE = `@code {
  @client {
    import { signal } from '@fudic/core';

    const open = signal(false);
    const toggle = () => open.set(!open());
  }
}

`;

describe('a static attribute on the identity tag', () => {
  it('is written on the host in the server render', () => {
    const { server } = emit('role="group"');
    expect(server).toContain('const $host = $dom.host($shadow);');
    expect(server).toContain('$dom.setAttr($host, "role", "group");');
  });

  it('is written on the host in the client chunk too', () => {
    const { client } = emit('role="group"');
    expect(client).toContain('$dom.setAttr($host, "role", "group");');
  });
});

describe('an interpolated attribute on the identity tag', () => {
  it('goes through the omit-if-falsy branch on the server, like any other', () => {
    const { server } = emit('data-open="@(open())"', CLIENT_CODE);
    expect(server).toContain('const $host = $dom.host($shadow);');
    expect(server).toMatch(/setAttr\(\$host, "data-open"/u);
  });

  it('rides `$a()` on the client, so it follows the signal', () => {
    const { client } = emit('data-open="@(open())"', CLIENT_CODE);
    const apply = client.slice(client.indexOf('const $a = () => {'), client.indexOf('return {'));
    expect(apply).toContain('$host');
    expect(apply).toContain('data-open');
  });
});

describe('an event on the identity tag (the one that was silently dropped)', () => {
  it('becomes a listener on the host in the client chunk', () => {
    const { client } = emit('@click="@toggle()"', CLIENT_CODE);
    expect(client).toContain('$host');
    expect(client).toMatch(/\$d\.push\(\$dom\.event\(\$host, "click", /u);
  });

  it('carries the author’s expression, which is what needed the Oxc batch', () => {
    // `collectAttributeJs` registers the identity tag's attributes before the template walk.
    // Without it the handler's AST was never in the batch and the listener was never emitted.
    const { client } = emit('@click="@toggle()"', CLIENT_CODE);
    expect(client).toContain('toggle()');
  });

  it('is the client branch’s alone: the server declares no `$host` for it', () => {
    // An `@event` has no server side, so a host carrying nothing but listeners must not make
    // that branch declare a `$host` no line below would read.
    const { server } = emit('@click="@toggle()"', CLIENT_CODE);
    expect(server).not.toContain('$dom.host($shadow)');
  });
});

describe('a tag with no binding keeps the exact bytes it had (§4.4)', () => {
  it('declares no `$host` on either branch', () => {
    const { server, client } = emit('');
    expect(server).not.toContain('$host');
    expect(client).not.toContain('$host');
  });
});

describe('BUG-32 T4 — `class:` reads the signal instead of testing the object', () => {
  /** A tag INSIDE the shadow, where a `class:` is legal — FUD0720 guards the host. */
  function inner(markup: string): { server: string; client: string } {
    const io = memoryIo({
      '/page.fud':
        '<link rel="component" href="./app-host.fud">\n' +
        '<html><head></head><body><app-host></app-host></body></html>\n',
      '/app-host.fud': `${CLIENT_CODE}<app-host>\n  <template shadowrootmode="open">${markup}</template>\n</app-host>\n`,
    });
    const graph: ComponentGraph = resolveComponents('/page.fud', io);
    const component = graph.components.get('app-host')!;
    return {
      server: emitComponentModule(graph, component),
      client: emitComponentClientModule(graph, component),
    };
  }

  it('calls the signal on the client: the object is always truthy and never came off', () => {
    // `(open) && "red"` tested the signal OBJECT, so the class went on at the first render
    // and `open.set(false)` never took it off. Decision 84 applies here as much as to an
    // attribute.
    const { client } = inner('<p class:red="@open"></p>');
    expect(client).toContain('(open()) && "red"');
    expect(client).not.toContain('(open) && "red"');
  });

  it('and reads its inert value on the server, where a signal is a function of one line', () => {
    const { server } = inner('<p class:red="@open"></p>');
    expect(server).toContain('(open()) && "red"');
  });

  it('leaves a plain boolean alone: there is nothing to call', () => {
    const { client } = inner('<p class:red="@(1 > 0)"></p>');
    expect(client).toContain('(1 > 0)) && "red"');
  });
});
