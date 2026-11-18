/**
 * `fud-around` — the hosts that listen around a child host (SDD-85 decision 43).
 *
 * The capturer raises the nearest host of a gesture. A listener written AROUND a child host —
 * on an element that holds it, or on its own tag — belongs to an ancestor of that host, and the
 * page has to say so or a click on the child reaches nobody.
 */
import { describe, expect, it } from 'vitest';
import { emitRouteModule, hydratableTags, resolveComponents, resolveDocument } from '../../src/emit/index.js';
import { aroundTags } from '../../src/emit/maps.js';
import { BARE_LAYOUT, memoryIo } from './_support.js';

/** A route linking the given components, with one instance of the first. */
function home(tags: readonly string[], body = `<${tags[0]!}></${tags[0]!}>`): string {
  const links = tags.map((t) => `<link rel="component" href="./${t}.fud">`).join('\n');
  return `<link rel="layout" href="./_layout.fud">
${links}
${body}
`;
}

/** The route module of `/app/home.fud`, with the bare layout beside it. */
function routeModule(files: Record<string, string>): string {
  return emitRouteModule(resolveDocument('/app/home.fud', memoryIo({ '/app/_layout.fud': BARE_LAYOUT, ...files })).value);
}

/** A component whose shadow is `markup`, with a handler `go` and a `@client` signal. */
function comp(tag: string, markup: string, links: readonly string[] = []): string {
  return `${links.map((l) => `<link rel="component" href="./${l}.fud">`).join('\n')}
@code {
  import { signal } from "@fudic/core";
  const n = signal(0);
  function go() { n.set(n() + 1); }
}
<${tag}>
  <template shadowrootmode="open">
${markup}
  </template>
</${tag}>
`;
}

const KID = comp('x-kid', '<button @click=@go>@n()</button>');

const aroundOf = (files: Record<string, string>): readonly string[] => {
  const graph = resolveComponents('/app/home.fud', memoryIo(files));
  return aroundTags(graph, hydratableTags(graph));
};

describe('fud-around (SDD-85 decision 43)', () => {
  it('a listener on an element that holds a child host: the owner is listed', () => {
    expect(
      aroundOf({
        '/app/home.fud': home(['x-own', 'x-kid']),
        '/app/x-own.fud': comp('x-own', '<section @click=@go><x-kid delegate:k="click"></x-kid></section>', ['x-kid']),
        '/app/x-kid.fud': KID,
      }),
    ).toEqual(['x-own']);
  });

  it('a listener written on the child host itself counts too', () => {
    expect(
      aroundOf({
        '/app/home.fud': home(['x-own', 'x-kid']),
        '/app/x-own.fud': comp('x-own', '@if (n() > 0) {<p>a</p>}<x-kid @click=@go></x-kid>', ['x-kid']),
        '/app/x-kid.fud': KID,
      }),
    ).toEqual(['x-own']);
  });

  it('listeners beside a child, and not around it, list nobody; nor does the child', () => {
    expect(
      aroundOf({
        '/app/home.fud': home(['x-own', 'x-kid']),
        '/app/x-own.fud': comp('x-own', '<button @click=@go>+</button><div><x-kid></x-kid></div>', ['x-kid']),
        '/app/x-kid.fud': KID,
      }),
    ).toEqual([]);
  });

  it('a route that listens around a host is listed by its name', () => {
    const files = {
      '/app/x-kid.fud': KID,
      '/app/l.fud': '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
      '/app/routes/index.fud': `<link rel="layout" href="../l.fud">
<link rel="component" href="../x-kid.fud">
@code {
  import { signal } from "@fudic/core";
  const n = signal(0);
  function go() { n.set(n() + 1); }
}
<main @click=@go><x-kid></x-kid></main>
<p>@n()</p>
`,
    };
    const graph = resolveComponents('/app/routes/index.fud', memoryIo(files));
    expect(aroundTags(graph, hydratableTags(graph), 'index')).toEqual(['index']);
    // And with no route name, nobody: a page has no client half of its own to list.
    expect(aroundTags(graph, hydratableTags(graph))).toEqual([]);
  });

  it('the page carries it as `fud-around`, and a page with no such listener carries none', () => {
    const own = {
      '/app/home.fud': home(['x-own', 'x-kid']),
      '/app/x-own.fud': comp('x-own', '<section @click=@go><x-kid></x-kid></section>', ['x-kid']),
      '/app/x-kid.fud': KID,
    };
    expect(routeModule(own)).toContain(`'fud-around', FUD_AROUND`);
    const flat = { '/app/home.fud': home(['x-kid']), '/app/x-kid.fud': KID };
    expect(routeModule(flat)).not.toContain('fud-around');
  });
});
