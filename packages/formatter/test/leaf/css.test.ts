import { describe, expect, it } from 'vitest';
import type { ElementNode, StyleNode } from '@fudic/compiler';
import { formatStyleBody, oxfmtEngine } from '../../src/leaf/index.js';
import { FakeEngine, options, parse } from '../_support.js';

/** The `<style>` body of a source, with the span the parser gave it. */
function styleOf(source: string): { style: StyleNode; span: { start: number; end: number } } {
  const doc = parse(source);
  const element = doc.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  )!;
  const style = element.children.find((c): c is StyleNode => c.type === 'style-content')!;
  return { style, span: style.span };
}

describe('formatStyleBody', () => {
  it('formats plain CSS and hands back a body that starts at column zero', async () => {
    const source = '<style>\n  .a{color:red}\n</style>';
    const { style, span } = styleOf(source);
    const out = await formatStyleBody(oxfmtEngine, source, style, span, 0, options());
    expect(out.text).toBe('.a {\n  color: red;\n}');
    expect(out.note).toBeUndefined();
  });

  it('restores every Razor region exactly, in every position it can occupy', async () => {
    const source = [
      '<style>',
      '  @media (min-width: @bp.tablet) {',
      '    .a{color:@(theme.fg);}',
      '  }',
      '</style>',
    ].join('\n');
    const { style, span } = styleOf(source);
    const out = await formatStyleBody(oxfmtEngine, source, style, span, 0, options());
    expect(out.text).toContain('@media (min-width: @bp.tablet)');
    expect(out.text).toContain('color: @(theme.fg);');
    expect(out.note).toBeUndefined();
  });

  it('restores a region carrying a $ without reading it as a substitution pattern', async () => {
    const source = '<style>\n  .a{color:@($theme.fg);}\n</style>';
    const { style, span } = styleOf(source);
    const out = await formatStyleBody(oxfmtEngine, source, style, span, 0, options());
    expect(out.text).toContain('color: @($theme.fg);');
  });

  it('leaves an empty body alone without asking anybody', async () => {
    const source = '<style>\n</style>';
    const { style, span } = styleOf(source);
    const engine = new FakeEngine();
    const out = await formatStyleBody(engine, source, style, span, 0, options());
    expect(out.text).toBe('\n');
    expect(engine.requests).toHaveLength(0);
  });

  it('copies the body verbatim and notes it when the CSS does not parse', async () => {
    const source = '<style>\n  .a{color:red;\n</style>';
    const { style, span } = styleOf(source);
    const engine = new FakeEngine((r) => ({ code: r.source, ok: false }));
    const out = await formatStyleBody(engine, source, style, span, 0, options());
    expect(out.text).toBe('\n  .a{color:red;\n');
    expect(out.note?.code).toBe('FUD0480');
    expect(out.note?.message).toContain('does not parse as CSS');
  });

  it('copies the body verbatim when a placeholder is swallowed', async () => {
    const source = '<style>\n  .a{color:@(fg);}\n</style>';
    const { style, span } = styleOf(source);
    const engine = new FakeEngine(() => ({ code: '.a {\n  color: red;\n}', ok: true }));
    const out = await formatStyleBody(engine, source, style, span, 0, options());
    expect(out.text).toBe('\n  .a{color:@(fg);}\n');
    expect(out.note?.message).toContain('Razor region');
  });

  it('copies the body verbatim when a placeholder comes back twice', async () => {
    const source = '<style>\n  .a{color:@(fg);}\n</style>';
    const { style, span } = styleOf(source);
    const engine = new FakeEngine((r) => ({ code: `${r.source}\n${r.source}`, ok: true }));
    const out = await formatStyleBody(engine, source, style, span, 0, options());
    expect(out.text).toBe('\n  .a{color:@(fg);}\n');
    expect(out.note?.message).toContain('Razor region');
  });

  it('masks with a lowercase placeholder, because CSS lowercases property names', async () => {
    const source = '<style>\n  .a{@(prop): 1px}\n</style>';
    const { style, span } = styleOf(source);
    const engine = new FakeEngine();
    await formatStyleBody(engine, source, style, span, 0, options());
    expect(engine.requests[0]?.source).toContain('__fud_p0__');
    expect(engine.requests[0]?.source).not.toMatch(/[A-Z]/);
  });
});
