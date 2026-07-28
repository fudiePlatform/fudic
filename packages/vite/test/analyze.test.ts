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
      isPage: false,
      hasLoad: false,
      hasPaths: false,
      strategy: NO_STRATEGY,
    });
  });

  it('a page with no @code exports nothing', () => {
    expect(analyzePage(page())).toEqual({
      isPage: true,
      hasLoad: false,
      hasPaths: false,
      strategy: NO_STRATEGY,
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
});
