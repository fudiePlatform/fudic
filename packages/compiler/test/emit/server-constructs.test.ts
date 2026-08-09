/**
 * The server branch of the five control constructs (BUG-19).
 *
 * `block.test.ts` already writes `@switch`, `@for` and `@while` — but only against the
 * CLIENT chunk, which is exactly why the server painting nothing for them survived. This
 * suite asks the other half the same questions: what the server module says, what the HTML
 * it renders holds, and what the walk through those bodies drags along with it — the child
 * component imports and the linked assets.
 *
 * Components are built in MEMORY, never as fixtures: a fixture using one of the three would
 * move a golden, and the goldens are the witness that this correction touched one branch
 * only (§6.10).
 */
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentModuleMapped,
  type ComponentGraph,
  type EmitOptions,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** A graph from an in-memory page that links every component given. */
function graphOf(components: Record<string, string>): ComponentGraph {
  const tags = Object.keys(components);
  const links = tags.map((t) => `<link rel="component" href="./${t}.fud">`).join('\n');
  const files: Record<string, string> = {
    '/page.fud': `${links}\n<html><head></head><body><${tags[0]!}></${tags[0]!}></body></html>\n`,
  };
  for (const [tag, source] of Object.entries(components)) files[`/${tag}.fud`] = source;
  return resolveComponents('/page.fud', memoryIo(files));
}

/** A component whose shadow root holds `markup`, with `code` in front of it. */
const component = (tag: string, code: string, markup: string): string =>
  `${code}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

/** The emitted SERVER module of a one-component graph. */
function server(tag: string, source: string, options: EmitOptions = {}): string {
  const graph = graphOf({ [tag]: source });
  return emitComponentModule(graph, graph.components.get(tag)!, options);
}

describe('the walk the three constructs used to skip (§6.8, §6.9)', () => {
  /**
   * A child component reachable ONLY through a construct the server did not walk. The
   * import list is `MarkupEmitter.used`, filled while painting an element: no walk, no
   * import — coherent while nothing was painted, wrong the moment the body is emitted.
   */
  it('imports a component that only appears inside a @switch, and calls it in place', () => {
    const graph = graphOf({
      'x-host': component(
        'x-host',
        '@code {\n  const { kind } = props<{ kind: string }>();\n}\n',
        "<div>@switch (kind) { case 'a': <app-x></app-x> default: <b></b> }</div>",
      ),
      'app-x': component('app-x', '', '<i></i>'),
    });
    const code = emitComponentModule(graph, graph.components.get('x-host')!);

    expect(code).toContain("import { render as renderAppX } from './app-x.mjs';");
    expect(code).toContain('renderAppX($dom,');
  });

  it('imports a component that only appears inside a @for or a @while', () => {
    const inFor = graphOf({
      'x-for': component(
        'x-for',
        '@code {\n  const { n } = props<{ n: number }>();\n}\n',
        '<ol>@for (let i = 0; i < n; i++) { <app-x></app-x> }</ol>',
      ),
      'app-x': component('app-x', '', '<i></i>'),
    });
    expect(emitComponentModule(inFor, inFor.components.get('x-for')!)).toContain(
      "import { render as renderAppX } from './app-x.mjs';",
    );

    const inWhile = graphOf({
      'x-while': component(
        'x-while',
        '@code {\n  const { head } = props<{ head: unknown }>();\n}\n',
        '<ul>@while (head !== null) { <app-x></app-x> }</ul>',
      ),
      'app-x': component('app-x', '', '<i></i>'),
    });
    expect(emitComponentModule(inWhile, inWhile.components.get('x-while')!)).toContain(
      "import { render as renderAppX } from './app-x.mjs';",
    );
  });

  /**
   * The asset linker is fed by `writeElementAttrs`, which the walk reaches. An `<img>` inside
   * a `@while` was linked by the client branch and not by the server one: two branches with a
   * different asset list for the same file.
   */
  it('links an asset inside the three constructs', () => {
    const code = server(
      'x-assets',
      component(
        'x-assets',
        '@code {\n  const { kind, n } = props<{ kind: string; n: number }>();\n}\n',
        "<div>@switch (kind) { case 'a': <img src=\"./a.png\"> }" +
          '@for (let i = 0; i < n; i++) { <img src="./b.png"> }' +
          '@while (n > 9) { <img src="./c.png"> }</div>',
      ),
      { linkAssets: true, assetExists: () => true },
    );

    expect(code).toContain('import __fudic_asset_0 from "./a.png";');
    expect(code).toContain('import __fudic_asset_1 from "./b.png";');
    expect(code).toContain('import __fudic_asset_2 from "./c.png";');
  });

  it('reports an asset that is missing inside a construct, as it does inside an @if', () => {
    const graph = graphOf({
      'x-missing': component(
        'x-missing',
        '@code {\n  const { kind } = props<{ kind: string }>();\n}\n',
        "<div>@switch (kind) { case 'a': <img src=\"./gone.png\"> }" +
          '@if (kind) { <img src="./also-gone.png"> }</div>',
      ),
    });
    const out = emitComponentModuleMapped(graph, graph.components.get('x-missing')!, {
      linkAssets: true,
      assetExists: (spec) => spec !== './gone.png' && spec !== './also-gone.png',
    });

    // The build does not abort: the URL stays a literal and the plugin reports FUD0363.
    expect(out.missingAssets).toEqual(['./gone.png', './also-gone.png']);
    expect(out.code).toContain('"src", "./gone.png"');
  });
});
