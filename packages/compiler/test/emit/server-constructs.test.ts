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
  emitPageModule,
  type ComponentGraph,
  type EmitOptions,
} from '../../src/emit/index.js';
import { memoryIo, renderPageHtml } from './_support.js';

/** A page whose body holds `markup`, rendered against the `data` its expressions read. */
function pageGraph(markup: string): ComponentGraph {
  return resolveComponents(
    '/home.fud',
    memoryIo({
      '/home.fud':
        `<!DOCTYPE html>\n<html><head><title>t</title></head><body>${markup}</body></html>`,
    }),
  );
}

const pageHtml = (markup: string, data: unknown): Promise<string> =>
  renderPageHtml(pageGraph(markup), data);

const pageCode = (markup: string): string => emitPageModule(pageGraph(markup));

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

describe('@switch — one arm per case, with braces and no fall-through (§6.1, §6.4)', () => {
  const MARKUP =
    "<ul>@switch (data.kind) { case 'a': <p>A</p> case 'b': <b>B</b> default: <i>D</i> }</ul>";

  it('writes a switch whose arms each build their own nodes and break', () => {
    const code = pageCode(MARKUP);
    expect(code).toContain('switch (data.kind) {');
    expect(code).toContain("case 'a': {");
    expect(code).toContain("case 'b': {");
    expect(code).toContain('default: {');
    // One `break` per arm, the last one included: `SwitchCase` bodies are independent
    // (decision 14), and without it a match would paint the arms below it too.
    expect(code.match(/break;/gu)).toHaveLength(3);
    expect(code).toContain('$dom.element("p")');
    expect(code).toContain('$dom.element("i")');
  });

  it('renders the arm that matches, and only it', async () => {
    const html = await pageHtml(MARKUP, { kind: 'a' });
    expect(html).toContain('<p>A</p>');
    expect(html).not.toContain('<b>B</b>'); // no fall-through into the next case
    expect(html).not.toContain('<i>D</i>');
  });

  it('renders the default arm when nothing matches, and nothing when there is none', async () => {
    expect(await pageHtml(MARKUP, { kind: 'zzz' })).toContain('<i>D</i>');

    const noDefault = "<ul>@switch (data.kind) { case 'a': <p>A</p> }</ul>";
    const html = await pageHtml(noDefault, { kind: 'zzz' });
    expect(html).not.toContain('<p>A</p>');
    expect(html).toContain('<ul>'); // the level itself is still there, just empty
  });
});

describe('@while and @for — the loop is the author’s header, spliced whole (§6.2, §6.3)', () => {
  it('splices a @while header and paints one turn’s markup per turn', async () => {
    // `@(…)` and not `@data.rows.shift()`: an implicit expression stops before the call
    // parenthesis, and a `@while` whose body never consumes a row is a prerender that hangs
    // — which is the one thing an author can now notice that could not happen before (§4.5).
    const markup = '<ul>@while (data.rows.length > 0) { <li>@(data.rows.shift())</li> }</ul>';
    expect(pageCode(markup)).toContain('while (data.rows.length > 0) {');

    const html = await pageHtml(markup, { rows: ['a', 'b', 'c'] });
    expect(html.match(/<li>/gu)).toHaveLength(3);
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<li>c</li>');

    expect(await pageHtml(markup, { rows: [] })).not.toContain('<li>');
  });

  it('splices a classic @for header without breaking it at the semicolons', async () => {
    const markup = '<ol>@for (let i = 0; i < data.n; i++) { <li>@i</li> }</ol>';
    // The header travels as ONE fragment (decision 93): a split at `;` would emit three.
    expect(pageCode(markup)).toContain('for (let i = 0; i < data.n; i++) {');

    const html = await pageHtml(markup, { n: 3 });
    expect(html.match(/<li>/gu)).toHaveLength(3);
    expect(html).toContain('<li>0</li>');
    expect(html).toContain('<li>2</li>');
  });
});

describe('the key is the client’s, and the server never reads it (§6.5)', () => {
  it('leaves the key expression out of the server module', () => {
    const code = server(
      'x-keys',
      component(
        'x-keys',
        '@code {\n  const { rows } = props<{ rows: { id: string }[] }>();\n}\n',
        '<ul>@foreach (const r of rows) key (r.id) { <li>x</li> }</ul>' +
          '<ol>@for (let i = 0; i < 3; i++) key (i + 100) { <li>y</li> }</ol>',
      ),
    );

    expect(code).toContain('for (const r of rows) {');
    expect(code).not.toContain('r.id'); // row identity is reconciliation, and SSR renders once
    expect(code).not.toContain('i + 100');
  });
});

describe('nesting, in both directions (§6.6)', () => {
  it('paints a @switch inside a @foreach, and a @foreach inside a case', async () => {
    const markup =
      '<ul>@foreach (const row of data.rows) {' +
      "  @switch (row.kind) { case 'a': <p>@row.name</p> default: <i>@row.name</i> }" +
      '}</ul>' +
      "<ol>@switch (data.kind) { case 'a': @foreach (const n of data.names) { <li>@n</li> } }</ol>";

    const html = await pageHtml(markup, {
      rows: [
        { kind: 'a', name: 'one' },
        { kind: 'z', name: 'two' },
      ],
      kind: 'a',
      names: ['x', 'y'],
    });

    expect(html).toContain('<p>one</p>');
    expect(html).toContain('<i>two</i>');
    expect(html).toContain('<li>x</li>');
    expect(html).toContain('<li>y</li>');
  });
});

describe('every header lands on the offset the author wrote it at (§6.7)', () => {
  it('anchors the switch discriminant, each case test, and the two loop headers', () => {
    const source = component(
      'x-map',
      '@code {\n  const { kind, rows, n } = props<{ kind: string; rows: string[]; n: number }>();\n}\n',
      "<div>@switch (kind) { case 'a': <p>A</p> default: <i>D</i> }" +
        '@while (rows.length > 99) { <b>w</b> }' +
        '@for (let i = 0; i < n; i++) { <b>f</b> }</div>',
    );
    const graph = graphOf({ 'x-map': source });
    const { code, mappings } = emitComponentModuleMapped(graph, graph.components.get('x-map')!);
    const at = (gen: number): number | undefined =>
      mappings.find((m) => m.generatedOffset === gen)?.sourceOffset;
    const anchored = (prefix: string, text: string): void => {
      const src = at(code.indexOf(prefix) + prefix.length);
      expect(src).toBeDefined();
      expect(source.slice(src!, src! + text.length)).toBe(text);
    };

    anchored('switch (', 'kind');
    anchored('case ', "'a'");
    anchored('while (', 'rows.length > 99');
    anchored('for (', 'let i = 0; i < n; i++');
  });
});

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
