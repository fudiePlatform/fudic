/**
 * SDD-19 §4.2 inputs: page fact extraction over the compiler. Detects page vs component; what
 * a route's `.fudapi` declares (`load`, `paths`, `layout`) is `api-units`'s. Exercises the
 * `@fudic/compiler` dependency end to end.
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

describe('analyzePage — nothing of the @code is read (SDD-60 §4.5)', () => {
  it('a @server written in an old file declares no load, paths nor layout', () => {
    const src = page(serverBlock('export function load(ctx) { return {}; }\nexport function paths() { return []; }'));
    expect(analyzePage(src)).toMatchObject({ isPage: true, hasLoad: false, hasPaths: false, hasLayout: false });
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

  it('a component that does not parse says so too', () => {
    const component = '<app-badge><template shadowrootmode="open"><p>x</q></p></template></app-badge>\n';
    const analysis = analyzePage(component);
    expect(analysis.role).toBe('component');
    expect(analysis.diagnostics.map((d) => d.code)).toEqual(['FUD0051']);
  });
});
