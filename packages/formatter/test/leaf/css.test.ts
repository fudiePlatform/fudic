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

  it('hands the body to the engine as it is, with nothing masked', async () => {
    const source = '<style>\n  .A{color:red}\n</style>';
    const { style, span } = styleOf(source);
    const engine = new FakeEngine();
    await formatStyleBody(engine, source, style, span, 0, options());
    expect(engine.requests[0]?.source).toBe('\n  .A{color:red}\n');
  });
});
