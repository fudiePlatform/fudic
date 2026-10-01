/**
 * SDD-19 §4.2 inputs: page fact extraction over the compiler. Detects page vs
 * component and which `@server` hooks (`load`/`paths`) a page exports — the facts
 * that feed `resolveMode`. Exercises the `@fudic/compiler` dependency end to end.
 */

import { describe, it, expect } from 'vitest';
import { analyzePage } from '../src/analyze.js';
import { NO_STRATEGY } from '../src/strategy.js';

/** A minimal valid page document with the given `@code` body in its `<head>`. */
function page(code = ''): string {
  return `<!DOCTYPE html>
<html>
<head>
${code}
</head>
<body>
<h1>Hi</h1>
</body>
</html>
`;
}

const serverBlock = (body: string): string => `@code {
@server {
${body}
}
}`;

describe('analyzePage — page vs component', () => {
  it('recognizes a page document', () => {
    expect(analyzePage(page()).isPage).toBe(true);
  });

  it('a component document is not a page', () => {
    const component = `<app-badge>
  <template shadowrootmode="open">
    <span>x</span>
  </template>
</app-badge>
`;
    expect(analyzePage(component)).toEqual({
      role: 'component',
      isPage: false,
      hasLoad: false,
      hasPaths: false,
      hasLayout: false,
      strategy: NO_STRATEGY,
      diagnostics: [],
    });
  });

  it('a page with no @code exports nothing', () => {
    expect(analyzePage(page())).toEqual({
      role: 'page',
      isPage: true,
      hasLoad: false,
      hasPaths: false,
      hasLayout: false,
      strategy: NO_STRATEGY,
      diagnostics: [],
    });
  });
});

describe('analyzePage — @server hooks', () => {
  it('detects an exported function load', () => {
    const src = page(serverBlock('export function load(ctx) { return { id: ctx.params.id }; }'));
    expect(analyzePage(src)).toMatchObject({ isPage: true, hasLoad: true, hasPaths: false });
  });

  it('detects both load and paths', () => {
    const src = page(
      serverBlock('export function load(ctx) { return {}; }\nexport function paths() { return []; }'),
    );
    expect(analyzePage(src)).toMatchObject({ hasLoad: true, hasPaths: true });
  });

  it('detects load declared as an exported const (arrow)', () => {
    const src = page(serverBlock('export const load = (ctx) => ({ id: ctx.params.id });'));
    expect(analyzePage(src)).toMatchObject({ hasLoad: true });
  });

  it('detects load exported via a specifier list', () => {
    const src = page(serverBlock('function load(ctx) { return {}; }\nexport { load };'));
    expect(analyzePage(src)).toMatchObject({ hasLoad: true });
  });

  it('a non-exported load does not count (must be an export)', () => {
    const src = page(serverBlock('function load(ctx) { return {}; }'));
    expect(analyzePage(src).hasLoad).toBe(false);
  });

  it('load only counts inside @server, not a neutral chunk', () => {
    const src = page('@code {\nexport function load(ctx) { return {}; }\n}');
    expect(analyzePage(src).hasLoad).toBe(false);
  });

  it('detects the third reserved name, `layout(ctx, data)` (SDD-40 §3.2)', () => {
    const src = page(
      serverBlock(
        'export function load(ctx) { return { post: ctx.params.slug }; }\n' +
          'export async function layout(ctx, data) { return { culture: data.post }; }',
      ),
    );
    expect(analyzePage(src)).toMatchObject({ hasLoad: true, hasLayout: true });
  });

  it('a route with no layout resolver says so', () => {
    const src = page(serverBlock('export function load(ctx) { return {}; }'));
    expect(analyzePage(src).hasLayout).toBe(false);
  });
});

describe('analyzePage — what the parse said (SDD-35 §1.1)', () => {
  it('a route whose markup is broken is analysed all the same, and says why', () => {
    const src = page('<p>hi</q></p>');
    const analysis = analyzePage(src);
    expect(analysis.isPage).toBe(true);
    expect(analysis.diagnostics).toEqual([expect.objectContaining({ code: 'FUD0051', severity: 'error' })]);
    const [d] = analysis.diagnostics;
    expect(src.slice(d!.span.start, d!.span.end)).toBe('</q>');
  });

  it('a `@server` that does not parse says so, over the file’s own offsets', () => {
    const src = page(serverBlock('export function load( { return 1; }'));
    const [d, ...rest] = analyzePage(src).diagnostics;
    expect(rest).toEqual([]);
    expect(d).toMatchObject({ code: 'FUD0170', severity: 'error' });
    expect(src.slice(d!.span.start)).toMatch(/^1; \}/u);
  });

  it('a component that does not parse says so too', () => {
    const component = '<app-badge><template shadowrootmode="open"><p>x</q></p></template></app-badge>\n';
    const analysis = analyzePage(component);
    expect(analysis.role).toBe('component');
    expect(analysis.diagnostics.map((d) => d.code)).toEqual(['FUD0051']);
  });
});
