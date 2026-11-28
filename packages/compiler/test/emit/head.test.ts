/**
 * Two emit contracts the Vite plugin depends on (SDD-19 §4.5/§4.11.1):
 *
 * 1. A route's `<head>` is the author's: every element passes through VERBATIM — favicon,
 *    stylesheet, `<script src>`, `<base>` — except `<title>` (interpolated) and
 *    `<link rel="component">` (the component graph, never output).
 * 2. `componentSpecifier` is injected, so a component may live outside the importing
 *    file's directory. Without it the emit keeps the sibling default `./<tag><ext>`.
 */
import { describe, expect, it } from 'vitest';
import { resolveDocument, emitRouteModule } from '../../src/emit/index.js';
import { BARE_LAYOUT, memoryIo } from './_support.js';

const BADGE = `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}

<head>
  <style>.badge { color: red; }</style>
</head>

<app-badge>
  <template shadowrootmode="open"><span class="badge"><slot></slot></span></template>
</app-badge>
`;

const PAGE = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-badge.fud">
<head>
  <title>@data.title</title>
  <meta charset="utf-8">
  <link rel="icon" href="./logo.svg">
  <link rel="stylesheet" href="https://cdn.example/reset.css">
  <script type="module" src="/fudic-main.js"></script>
</head>
<app-badge tone="success">ok</app-badge>
`;

const io = memoryIo({
  '/app/layouts/_layout.fud': BARE_LAYOUT,
  '/app/routes/index.fud': PAGE,
  '/app/components/app-badge.fud': BADGE,
});
const graph = resolveDocument('/app/routes/index.fud', io).value;

/** The emitted module quotes the head with JSON escapes; read it back unescaped. */
const unescaped = (code: string): string => code.replace(/\\"/gu, '"');

describe('route <head> passthrough', () => {
  const src = unescaped(emitRouteModule(graph));

  it('keeps every element the author wrote', () => {
    expect(src).toContain('<meta charset="utf-8">');
    expect(src).toContain('<link rel="icon" href="./logo.svg">');
    expect(src).toContain('<link rel="stylesheet" href="https://cdn.example/reset.css">');
    // The author's script carries the response's nonce, right after its name (SDD-84 §4.7).
    expect(src).toContain('"<script" + $nonce + " type="module" src="/fudic-main.js"></script>"');
  });

  it('interpolates <title> and drops the component links', () => {
    expect(src).toContain("head += '<title>' + (escapeText(String((data.title) ?? ''))) + '</title>");
    expect(src).not.toContain('rel="component"');
  });
});

describe('asset linking inside <head> (linkAssets)', () => {
  const src = unescaped(
    emitRouteModule(graph, { linkAssets: true, assetExists: (spec) => spec === './logo.svg' }),
  );

  it('rewrites a relative, existing URL to the import binding Vite resolves', () => {
    expect(src).toContain('import __fudic_asset_0 from "./logo.svg";');
    expect(src).toContain('<link rel="icon" href="" + __fudic_asset_0 + "">');
  });

  it('leaves an absolute URL and a root-absolute one untouched', () => {
    expect(src).toContain('<link rel="stylesheet" href="https://cdn.example/reset.css">');
    expect(src).toContain('src="/fudic-main.js"');
  });
});

// Finding 3: a head element is copied from the source, and `@@` is the one thing in it the source
// does not say literally.
describe('`@@` in an attribute of the <head>', () => {
  const ESCAPED = `<link rel="layout" href="../layouts/_layout.fud">
<head>
  <link rel="preload" href="@@acme/ui/fonts/x.woff2" as="font" data-by="@@me">
</head>
<p>x</p>
`;
  const escaped = resolveDocument(
    '/app/routes/index.fud',
    memoryIo({ '/app/layouts/_layout.fud': BARE_LAYOUT, '/app/routes/index.fud': ESCAPED }),
  ).value;

  it('is written as the `@` it means, and the host is asked for the package path', () => {
    const asked: string[] = [];
    const src = unescaped(
      emitRouteModule(escaped, { linkAssets: true, assetExists: (spec) => (asked.push(spec), false) }),
    );
    expect(asked).toEqual(['@acme/ui/fonts/x.woff2']);
    expect(src).toContain('<link rel="preload" href="@acme/ui/fonts/x.woff2" as="font" data-by="@me">');
    expect(src).not.toContain('@@');
  });

  it('after a linked URL too', () => {
    const src = unescaped(
      emitRouteModule(escaped, { linkAssets: true, assetExists: () => true, assetUrl: () => '/assets/x-1.woff2' }),
    );
    expect(src).toContain('<link rel="preload" href="" + "/assets/x-1.woff2" + "" as="font" data-by="@me">');
  });
});

describe('componentSpecifier', () => {
  it('defaults to the sibling file convention', () => {
    expect(emitRouteModule(graph)).toContain("from './app-badge.mjs'");
    expect(emitRouteModule(graph, { importExt: '.fud' })).toContain("from './app-badge.fud'");
  });

  it('uses the injected specifier, so the component can live anywhere', () => {
    const src = emitRouteModule(graph, {
      importExt: '.fud',
      componentSpecifier: (c) => `../components/${c.tag}.fud`,
    });
    expect(src).toContain("from '../components/app-badge.fud'");
    expect(src).not.toContain("from './app-badge.fud'");
  });
});
