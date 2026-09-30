/**
 * SDD-47 §4.1 — an `@event` on the `<template shadowrootmode>` listens on the SHADOW ROOT.
 *
 * The host hears what the platform lets out of the shadow; the shadow root hears everything
 * that happens inside it. The template is not an element of the output, so what it takes is
 * its listeners and nothing else: no attribute write on either branch.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  hydratableTags,
  isIntrinsicallyHydratable,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** A `@code { @client }` block declaring the handlers the cases below call. */
const CLIENT_CODE = `@code {
  @client {
    function onShadow(e: Event) { void e; }
    function note(where: string, e: Event, n: number) { void where; void e; void n; }
  }
}

`;

/** A component whose `<template>` carries `templateAttrs` and whose host carries `hostAttrs`. */
function graphOf(templateAttrs: string, code = CLIENT_CODE, hostAttrs = ''): ComponentGraph {
  const io = memoryIo({
    '/page.fud':
      '<link rel="component" href="./app-ear.fud">\n' +
      '<html><head></head><body><app-ear></app-ear></body></html>\n',
    '/app-ear.fud':
      `${code}<app-ear${hostAttrs === '' ? '' : ` ${hostAttrs}`}>\n` +
      `  <template shadowrootmode="open"${templateAttrs === '' ? '' : ` ${templateAttrs}`}><p>hi</p></template>\n` +
      '</app-ear>\n',
  });
  return resolveComponents('/page.fud', io);
}

function emit(templateAttrs: string, code = CLIENT_CODE, hostAttrs = ''): { server: string; client: string } {
  const graph = graphOf(templateAttrs, code, hostAttrs);
  const component = graph.components.get('app-ear')!;
  return {
    server: emitComponentModule(graph, component),
    client: emitComponentClientModule(graph, component),
  };
}

describe('criterion 1 — a listener on the shadow root', () => {
  it('becomes `$dom.event($shadow, …)` in the client chunk', () => {
    const { client } = emit('@click=@onShadow');
    expect(client).toContain('$shadow && $d.push($dom.event($shadow, "click", onShadow));');
  });

  it('goes after the host’s own listeners, which is source order', () => {
    const { client } = emit('@click=@onShadow', CLIENT_CODE, '@keydown=@onShadow');
    const host = client.indexOf('$dom.event($host, "keydown"');
    const shadow = client.indexOf('$dom.event($shadow, "click"');
    expect(host).toBeGreaterThan(-1);
    expect(shadow).toBeGreaterThan(host);
  });

  it('takes a custom event name exactly as the host does', () => {
    const { client } = emit('@aviso-dentro=@onShadow');
    expect(client).toContain('$dom.event($shadow, "aviso-dentro", onShadow)');
  });
});

describe('criterion 2 — the three forms of handler', () => {
  it('a reference is handed over as it is', () => {
    expect(emit('@click=@onShadow').client).toContain('"click", onShadow)');
  });

  it('a call with values receives the event as `$event`', () => {
    const { client } = emit('@click=@note("shadow", $event, 2)');
    expect(client).toMatch(/\$dom\.event\(\$shadow, "click", \(\$event\) => note\("shadow", \$event, 2\)\)/);
  });

  it('a lambda is written as the author wrote it', () => {
    const { client } = emit('@click=@((e) => onShadow(e))');
    expect(client).toContain('$dom.event($shadow, "click", (e) => onShadow(e))');
  });

  it('an expression that cannot be subscribed is dropped with the same diagnostic as anywhere', () => {
    // The emit does not throw: the binding goes, the page still emits.
    const { client } = emit('@click=@(1 + 2)');
    expect(client).not.toContain('$dom.event($shadow');
  });
});

describe('criterion 3 — the server render does not change', () => {
  it('a template event writes nothing on the server branch', () => {
    expect(emit('@click=@onShadow').server).toBe(emit('').server);
  });
});

describe('criterion 4 — an event on the host or the template is hookup', () => {
  it('a component whose only binding is a template event hydrates', () => {
    const graph = graphOf('@click=@(() => 0)', '');
    expect(isIntrinsicallyHydratable(graph.components.get('app-ear')!)).toBe(true);
    expect([...hydratableTags(graph)]).toEqual(['app-ear']);
  });

  it('a component whose only binding is a host event hydrates', () => {
    const graph = graphOf('', '', '@click=@(() => 0)');
    expect([...hydratableTags(graph)]).toEqual(['app-ear']);
  });

  it('a component with no binding anywhere stays level 1', () => {
    const graph = graphOf('', '');
    expect([...hydratableTags(graph)]).toEqual([]);
  });
});

describe('criterion 5 — a template with no event keeps the bytes it had', () => {
  it('emits no shadow-root listener', () => {
    expect(emit('').client).not.toContain('$dom.event($shadow');
  });

  it('the DSD’s own attributes are not listeners and are not written by the client', () => {
    const { client } = emit('shadowrootadoptedstylesheets="panel"');
    expect(client).not.toContain('$dom.event($shadow');
    expect(client).not.toContain('shadowrootadoptedstylesheets');
  });
});
