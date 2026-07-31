import { describe, expect, it } from 'vitest';
import { collectLeaves, oxfmtEngine } from '../../src/leaf/index.js';
import { FakeEngine, options, parse } from '../_support.js';

/** Every fragment the walk handed over, in source order. */
async function requestsFor(source: string): Promise<readonly string[]> {
  const engine = new FakeEngine();
  await collectLeaves(engine, source, parse(source).children, options());
  return engine.requests.map((r) => r.source);
}

describe('the walk', () => {
  it('finds an interpolation, an explicit expression and a @raw', async () => {
    expect(await requestsFor('<p>@data.title @(a?b:c) @raw(html)</p>')).toEqual([
      '(data.title);',
      '(a?b:c);',
      '(html);',
    ]);
  });

  it('finds the expressions inside attributes, including a bus: name', async () => {
    expect(await requestsFor('<a href="@u" class:on="@(f)" bus:(k)="@h"></a>')).toEqual([
      '(u);',
      '(f);',
      '(k);',
      '(h);',
    ]);
  });

  it('has nothing to hand over for a literal attribute value', async () => {
    expect(await requestsFor('<span class="badge" hidden>x</span>')).toEqual([]);
    expect(await requestsFor('<a href="/blog/@slug/">x</a>')).toEqual(['(slug);']);
  });

  it('handles an @if with no else', async () => {
    expect(await requestsFor('@if (a) { <p>x</p> }')).toEqual(['if (a) {}']);
  });

  it('wraps each control header with the sentinel its shape needs', async () => {
    const source = [
      '@if (a) { <p>@x</p> } else { <b>y</b> }',
      '@foreach (const i of xs) { <i>@i</i> }',
      '@for (let i = 0; i < 3; i++) { }',
      '@while (go) { }',
      '@switch (t) { case 1: <p>@p</p> default: }',
    ].join('\n');
    expect(await requestsFor(source)).toEqual([
      'if (a) {}',
      '(x);',
      'for (const i of xs) {}',
      '(i);',
      'for (let i = 0; i < 3; i++) {}',
      'if (go) {}',
      'switch (t) {}',
      '(1);',
      '(p);',
    ]);
  });

  it('finds every region of a @code block and an inline @{ }', async () => {
    const source = '@code {\n  const a = 1;\n  @server { const b = 2; }\n}\n@{ const c = 3; }';
    // The neutral chunk carries the whitespace around it: `dedent` is what takes it off,
    // after the engine, not before.
    expect(await requestsFor(source)).toEqual([
      '\n  const a = 1;\n  ',
      ' const b = 2; ',
      ' const c = 3; ',
    ]);
  });

  it('walks into a @section and hands the <style> body to CSS', async () => {
    const source = '@section nav {\n  <style>.a{color:red}</style>\n}';
    const engine = new FakeEngine();
    await collectLeaves(engine, source, parse(source).children, options());
    expect(engine.requests.map((r) => r.language)).toEqual(['css']);
    expect(engine.requests[0]?.source).toBe('.a{color:red}');
  });

  it('does not go inside an opaque element', async () => {
    // §4.4: `<script>`, `<pre>` and `<textarea>` are copied byte for byte.
    expect(await requestsFor('<script>const a = @x;</script>')).toEqual([]);
    expect(await requestsFor('<pre>@data.body</pre>')).toEqual([]);
    expect(await requestsFor('<textarea>@data.body</textarea>')).toEqual([]);
  });

  it('ignores text, comments, doctype, @@ and the Render markers', async () => {
    const source = '<!DOCTYPE html>\n<html><head>@RenderHead()</head><body>\n@* c *@ a@@b\n<!-- x -->\n@RenderBody()\n@RenderSection(nav)\n</body></html>';
    expect(await requestsFor(source)).toEqual([]);
  });
});

describe('the width each fragment is formatted against', () => {
  it('is the width that will be left once its indentation is paid', async () => {
    const source = '<div>\n  <p>@x</p>\n</div>';
    const engine = new FakeEngine();
    await collectLeaves(engine, source, parse(source).children, options({ tabWidth: 2 }));
    // `<div>` is depth 0, its `<p>` child depth 1, the interpolation inside it depth 2.
    expect(engine.requests[0]?.indentColumns).toBe(4);
  });
});

describe('the table', () => {
  it('answers by span, and says nothing about a span nobody formatted', async () => {
    const source = '<p>@data.title</p>';
    const table = await collectLeaves(oxfmtEngine, source, parse(source).children, options());
    expect(table.get({ start: 4, end: 14 })).toBe('data.title');
    expect(table.get({ start: 0, end: 3 })).toBeUndefined();
  });

  it('collects the notes in source order, never in the order the leaves resolved', async () => {
    const source = '<p>@(a ===) @(b ===)</p>';
    const table = await collectLeaves(oxfmtEngine, source, parse(source).children, options());
    expect(table.notes.map((n) => n.code)).toEqual(['FUD0481', 'FUD0481']);
    expect(table.notes.map((n) => n.span.start)).toEqual([5, 14]);
  });

  it('has no notes when every leaf came back formatted', async () => {
    const source = '<p>@data.title</p>';
    const table = await collectLeaves(oxfmtEngine, source, parse(source).children, options());
    expect(table.notes).toEqual([]);
  });
});
