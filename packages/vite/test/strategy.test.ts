/**
 * SDD-20 §4.8.1 / §6.21: `strategy()` read statically from the page. Driven through
 * `analyzePage`, so the whole path (parse → Oxc batch → AST walk) is exercised.
 */

import { describe, it, expect } from 'vitest';
import { analyzePage } from '../src/analyze.js';
import { FUD_STRATEGY_DUPLICATE, FUD_STRATEGY_NOT_LITERAL } from '../src/diagnostics.js';

const page = (body: string): string => `<!DOCTYPE html>
<html>
<head>
@code {
@server {
${body}
}
}
</head>
<body><h1>Hi</h1></body>
</html>
`;

describe('analyzePage — strategy()', () => {
  it('reads a literal declaration, nested objects included', () => {
    const { strategy } = analyzePage(
      page(`import { strategy } from '@fudic/core';
strategy({ mode: 'sw', data: { ttl: '5m', policy: 'cache-first' } });`),
    );
    expect(strategy.declared).toBe(true);
    expect(strategy.strategy).toEqual({
      mode: 'sw',
      data: { ttl: '5m', policy: 'cache-first' },
    });
    expect(strategy.diagnostics).toEqual([]);
  });

  it('a page that declares nothing is not declared', () => {
    const { strategy } = analyzePage(page('export function load() { return {}; }'));
    expect(strategy.declared).toBe(false);
    expect(strategy.strategy).toEqual({});
  });

  it('a non-literal argument is FUD0393 and declares nothing usable', () => {
    const { strategy } = analyzePage(page('strategy(config);'));
    expect(strategy.diagnostics[0]?.code).toBe(FUD_STRATEGY_NOT_LITERAL);
    expect(strategy.strategy).toEqual({});
  });

  it('a computed value inside the literal is FUD0393 too', () => {
    const { strategy } = analyzePage(page('strategy({ mode: MODES.sw });'));
    expect(strategy.diagnostics[0]?.code).toBe(FUD_STRATEGY_NOT_LITERAL);
  });

  it('a spread is not statically readable', () => {
    const { strategy } = analyzePage(page('strategy({ ...base, mode: "ssg" });'));
    expect(strategy.diagnostics[0]?.code).toBe(FUD_STRATEGY_NOT_LITERAL);
  });

  it('two calls are FUD0394; the first wins', () => {
    const { strategy } = analyzePage(
      page(`strategy({ mode: 'ssg' });
strategy({ mode: 'ssr' });`),
    );
    expect(strategy.strategy.mode).toBe('ssg');
    expect(strategy.diagnostics[0]?.code).toBe(FUD_STRATEGY_DUPLICATE);
  });

  it('ignores calls that are not strategy(), and other expression statements', () => {
    const { strategy } = analyzePage(page(`console.log('hi');\nother({ mode: 'ssr' });\n1 + 1;`));
    expect(strategy.declared).toBe(false);
  });

  it('reports the file it read, so the diagnostic is actionable', () => {
    const { strategy } = analyzePage(page('strategy(config);'), '/routes/blog.fud');
    expect(strategy.diagnostics[0]?.file).toBe('/routes/blog.fud');
  });
});
