/**
 * SDD-45 §3.6 — the layout's switch: is the runtime a FILE or does it travel in the page?
 *
 * The decision is the developer's and not the framework's, which is why it is written in the
 * layout: a strict security policy and a slow connection ask for opposite things, and only
 * the person deploying knows which of the two they have. The default is the file — what works
 * under the strictest policy and what is cached between navigations.
 *
 * And `?inline` is ONE query meaning ONE thing wherever it appears: on the marker it embeds
 * the coordinator, on a `<link rel="stylesheet">` it embeds that sheet.
 */

import { describe, expect, it } from 'vitest';
import { resolveDocument } from '../../src/emit/resolve.js';
import { emitLayoutModule, emitRouteModule } from '../../src/emit/index.js';
import { asksInline, inlineRuntimeMarker } from '../../src/emit/parts.js';
import type { ElementNode } from '../../src/html/index.js';
import { memoryIo } from './_support.js';

/** A layout whose head carries `marker`, plus a route that hydrates so the tags are written. */
function layoutModule(marker: string, extra: Record<string, string> = {}): string {
  const layout = [
    '<!DOCTYPE html><html><head>',
    marker,
    '@RenderHead()</head>',
    '<body><main>@RenderBody()</main></body></html>',
  ].join('\n');
  const io = memoryIo({ '/r.fud': ROUTE, '/l.fud': layout, ...extra });
  const graph = resolveDocument('/r.fud', io).value;
  return emitLayoutModule(graph, graph.layouts[0]!, {
    linkAssets: true,
    assetExists: () => true,
    assetUrl: (spec) => `/assets/${spec.replace(/^\.\//u, '')}`,
    assetText: (spec) => (spec === './tokens.css' ? SHEET : null),
  });
}

/** The route that goes with it: reactive, so it has something to hydrate. */
const ROUTE = [
  '<link rel="layout" href="./l.fud">',
  '@code { @client { const n = signal(1); } }',
  '<output>@n()</output>',
].join('\n');

/** A sheet with something to compact and a `url(…)` to link, so both passes are visible. */
const SHEET = ':root {\n  --gap:   1rem;\n}\nbody { background: url("./bg.png"); }';

/** The `<head>` of a standalone page, resolved, so the reporter can be asked directly. */
function headOf(head: string): ElementNode {
  const page = `<!DOCTYPE html><html><head>\n${head}\n</head><body><p>x</p></body></html>`;
  const io = memoryIo({ '/p.fud': page });
  const entry = resolveDocument('/p.fud', io).value.entry;
  // A standalone page owns its own head; a route's belongs to the layout it links, which is
  // the arrangement the layout tests above cover.
  return (entry as { readonly head: ElementNode }).head;
}

describe('asksInline', () => {
  it('reads the query and not the spelling of the string', () => {
    expect(asksInline('fudic:runtime?inline')).toBe(true);
    expect(asksInline('./tokens.css?inline')).toBe(true);
    // Among others, in either position: it is a query parameter, not a suffix.
    expect(asksInline('./tokens.css?inline&raw')).toBe(true);
    expect(asksInline('./tokens.css?raw&inline')).toBe(true);
    expect(asksInline('./tokens.css')).toBe(false);
    expect(asksInline('./tokens.css?raw')).toBe(false);
    // And `inline` in the NAME is not the query, which is the whole reason for parsing.
    expect(asksInline('./inline.css')).toBe(false);
  });
});

describe('the marker has three answers and not two', () => {
  it('the form travels as an ARGUMENT, because a layout is shared by many routes', () => {
    // A layout is compiled once and many routes render through it, so which form runs is
    // said by whoever holds the marker and passed down. Written into the route instead, two
    // routes with the same layout could disagree about a line neither of them wrote.
    expect(layoutModule('<script src="fudic:runtime"></script>')).toContain('.runtime(false)');
    expect(layoutModule('<script src="fudic:runtime?inline"></script>')).toContain(
      '.runtime(true)',
    );
  });

  it('a head with no marker asks for no runtime at all', () => {
    // The third answer. A layout that never wrote the marker gets no call, and that is not
    // the same as a layout that asked for the file.
    const module = layoutModule('<title>t</title>');
    expect(module).not.toContain('.runtime(');
  });

  it('an unknown query is a typo and NOT the default form', () => {
    // This is the first thing somebody "fixes" with a `startsWith`, and answering an unknown
    // query as if it were the default is exactly how a page ends up silently not inlining.
    for (const src of [
      'fudic:runtimeish',
      'fudic:runtime?inlin',
      'fudic:runtime?raw',
      'fudic:runtime?inline=false',
    ]) {
      expect(layoutModule(`<script src="${src}"></script>`)).not.toContain('.runtime(');
    }
    // `?inline=false` deserves a word: `URLSearchParams.has` answers about the KEY, so the
    // value is not read. It is not the default form either — it is not the marker at all.
  });

  it('an interpolated `src` is not a marker, because a marker is a constant', () => {
    const module = layoutModule('<script src="@theUrl"></script>');
    expect(module).not.toContain('.runtime(');
  });

  it('a `<script>` with no `src` is not a marker either', () => {
    const module = layoutModule('<script>console.log(1)</script>');
    expect(module).not.toContain('.runtime(');
  });
});

describe('inlineRuntimeMarker — where the head asked to embed', () => {
  it('reports the span of the marker that asked, so the host can raise FUD0803', () => {
    const head = headOf('<title>t</title>\n<script src="fudic:runtime?inline"></script>');
    const span = inlineRuntimeMarker(head);
    expect(span).not.toBeNull();
    // A fact about the SOURCE, reported and not acted on: whether an inline module is
    // allowed depends on the policy the application ships, and a compiler with no
    // filesystem has never seen it.
    expect(span!.end).toBeGreaterThan(span!.start);
  });

  it('reports nothing for the file form, and nothing for a head without the marker', () => {
    expect(inlineRuntimeMarker(headOf('<script src="fudic:runtime"></script>'))).toBeNull();
    expect(inlineRuntimeMarker(headOf('<title>t</title>'))).toBeNull();
  });
});

describe('`?inline` on a stylesheet (§3.6)', () => {
  it('becomes the sheet itself, with the nonce, and the `<link>` is gone', () => {
    const module = layoutModule('<link rel="stylesheet" href="./tokens.css?inline">');

    // The sheet, inline, carrying the nonce every other inline thing this emit writes has.
    expect(module).toContain("'<style' + $nonce + '>'");
    // And no `<link>` survives, nor an import for it: the build publishes no file, because
    // the reference the bundler would have followed is not there any more.
    expect(module).not.toContain('rel="stylesheet"');
    expect(module).not.toContain('tokens.css');
  });

  it('a layout that embeds declares `$nonce`, which it never had to before', () => {
    // A layout had never written an inline element of its own, so it did not declare the
    // binding. The failure was a `$nonce is not defined` in the prerender and not in a test.
    expect(layoutModule('<link rel="stylesheet" href="./tokens.css?inline">')).toContain(
      '$nonce',
    );
  });

  it('goes through the SAME two CSS passes, compacted and with `url(…)` linked', () => {
    const module = layoutModule('<link rel="stylesheet" href="./tokens.css?inline">');

    // Compacted: a second path for CSS is how one of two outputs stops being minified
    // without anybody noticing, which is literally the defect BUG-08 fixed.
    expect(module).toContain('--gap:1rem');
    expect(module).not.toContain('--gap:   1rem');
    // And its `url(…)` linked, so the image it names is published like any other asset.
    expect(module).toContain('/assets/bg.png');
  });

  it('a stylesheet and ONLY a stylesheet', () => {
    // `?inline` is a general instruction, but a document has exactly one kind of resource
    // whose embedding is free of consequences: CSS, which is text and which the page was
    // going to apply anyway. An icon embedded as a data URI grows the HTML of EVERY page by
    // a third of the file — a different trade with a different answer.
    const icon = layoutModule('<link rel="icon" href="./tokens.css?inline">');
    expect(icon).not.toContain("'<style'");
    const script = layoutModule('<script src="./tokens.css?inline"></script>');
    expect(script).not.toContain("'<style'");
  });

  it('without `?inline` the sheet stays a URL', () => {
    const module = layoutModule('<link rel="stylesheet" href="./tokens.css">');
    expect(module).not.toContain("'<style'");
    expect(module).toContain('/assets/tokens.css');
  });

  it('a sheet nobody can read here stays exactly as it was written', () => {
    // No reader for that path: what comes back is put IN the document, so a file that
    // cannot be read leaves the reference alone rather than embedding an empty `<style>`.
    const module = layoutModule('<link rel="stylesheet" href="./missing.css?inline">');
    expect(module).not.toContain("'<style'");
  });

  it('an interpolated `href` is not an embed request', () => {
    const module = layoutModule('<link rel="stylesheet" href="@sheetUrl">');
    expect(module).not.toContain("'<style'");
  });

  it('a `<link rel="stylesheet">` with no `href` is not one either', () => {
    const module = layoutModule('<link rel="stylesheet">');
    expect(module).not.toContain("'<style'");
  });
});

describe('and the route still decides WHETHER there is a runtime', () => {
  it('the form is the layout’s, the presence is the route’s', () => {
    // The two halves of the line the author wrote — where the runtime goes and how it
    // travels — are the layout's; whether this page hydrates is the route's (BUG-31 §T1).
    const io = memoryIo({
      '/r.fud': '<link rel="layout" href="./l.fud">\n<p>estática</p>',
      '/l.fud': [
        '<!DOCTYPE html><html><head><script src="fudic:runtime?inline"></script>',
        '@RenderHead()</head><body>@RenderBody()</body></html>',
      ].join('\n'),
    });
    const graph = resolveDocument('/r.fud', io).value;

    // The layout still passes the form it was told.
    expect(emitLayoutModule(graph, graph.layouts[0]!)).toContain('.runtime(true)');
    // And the route, which hydrates nothing, writes no coordinator in either form.
    expect(emitRouteModule(graph, { routeName: 'about' })).not.toContain('io.runtime.inline');
  });
});
