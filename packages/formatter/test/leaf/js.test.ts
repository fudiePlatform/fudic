import { describe, expect, it } from 'vitest';
import {
  dedent,
  formatJsFragment,
  oxfmtEngine,
  unwrapFragment,
  wrapFragment,
} from '../../src/leaf/index.js';
import { FakeEngine, options } from '../_support.js';

describe('wrapFragment', () => {
  it('turns each fragment of §4.2 into something parseable', () => {
    expect(wrapFragment('expression', "a ? 'b' : c")).toBe("(a ? 'b' : c);");
    expect(wrapFragment('condition', 'x > 0')).toBe('if (x > 0) {}');
    expect(wrapFragment('iteration', 'const x of xs')).toBe('for (const x of xs) {}');
    expect(wrapFragment('discriminant', 'tone')).toBe('switch (tone) {}');
    expect(wrapFragment('statements', 'const a = 1;')).toBe('const a = 1;');
  });
});

describe('dedent', () => {
  it('drops the base indentation and keeps the relative shape', () => {
    expect(dedent('  a\n    b\n  c')).toBe('a\n  b\nc');
  });

  it('drops the blank lines the wrapper left at either end', () => {
    expect(dedent('\n  a\n\n')).toBe('a');
    expect(dedent('   ')).toBe('');
  });

  it('leaves a fragment that already starts at column zero alone', () => {
    expect(dedent('const x of ys.filter(\n  (y) => y.on,\n)')).toBe(
      'const x of ys.filter(\n  (y) => y.on,\n)',
    );
  });

  it('does not overrun a line shorter than the base indentation', () => {
    expect(dedent('  a\n\n  b')).toBe('a\n\nb');
  });
});

describe('unwrapFragment', () => {
  it('takes the sentinel back off each header', () => {
    expect(unwrapFragment('condition', 'if (x > 0) {\n}', 'x>0')).toBe('x > 0');
    expect(unwrapFragment('iteration', 'for (let i = 0; i < n; i++) {}', '')).toBe(
      'let i = 0; i < n; i++',
    );
    expect(unwrapFragment('discriminant', 'switch (tone) {\n}', '')).toBe('tone');
  });

  it('dedents a header the formatter broke right after the parenthesis', () => {
    expect(unwrapFragment('condition', 'if (\n  averyLongCondition\n) {\n}', '')).toBe(
      'averyLongCondition',
    );
  });

  it('drops the parentheses of an expression only when they wrap the whole of it', () => {
    expect(unwrapFragment('expression', '({ a: 1 });', '')).toBe('{ a: 1 }');
    expect(unwrapFragment('expression', 'a ? b : c;', '')).toBe('a ? b : c');
    expect(unwrapFragment('expression', '(a) + (b);', '')).toBe('(a) + (b)');
  });

  it('returns the original when the semicolon is not where the wrapper put it', () => {
    // `@(x /* c */)` comes back as `x; /* c */`: the wrapper is no longer recognizable, and
    // guessing would drop a character of the user's code.
    expect(unwrapFragment('expression', 'x; /* c */', '(original)')).toBe('(original)');
  });

  it('returns statements dedented and nothing else', () => {
    expect(unwrapFragment('statements', '  const a = 1;\n  const b = 2;', '')).toBe(
      'const a = 1;\nconst b = 2;',
    );
  });
});

describe('formatJsFragment', () => {
  it('formats through the engine and comes back without the sentinel', async () => {
    const out = await formatJsFragment(oxfmtEngine, 'condition', 'x>0&&y', 0, false, options());
    expect(out).toEqual({ text: 'x > 0 && y', ok: true });
  });

  it('formats a real ternary, a real for-of and a real @code body', async () => {
    const o = options();
    expect((await formatJsFragment(oxfmtEngine, 'expression', "a?'x':'y'", 0, false, o)).text).toBe(
      'a ? "x" : "y"',
    );
    expect(
      (await formatJsFragment(oxfmtEngine, 'iteration', 'const item of data.items', 0, false, o)).text,
    ).toBe('const item of data.items');
    expect(
      (await formatJsFragment(oxfmtEngine, 'statements', 'const  a={b:1}', 0, false, o)).text,
    ).toBe('const a = { b: 1 };');
  });

  it('leaves a fragment that does not parse exactly as written, and says so', async () => {
    const out = await formatJsFragment(oxfmtEngine, 'expression', 'a ===', 0, false, options());
    expect(out).toEqual({ text: 'a ===', ok: false });
  });

  it('never asks the engine about an empty fragment', async () => {
    // `@()` is legal to type: wrapping it would manufacture a syntax error out of nothing.
    const engine = new FakeEngine();
    expect(await formatJsFragment(engine, 'expression', '  ', 0, false, options())).toEqual({
      text: '  ',
      ok: true,
    });
    expect(engine.requests).toHaveLength(0);
  });

  it('asks for the width that will be left once the fragment is indented', async () => {
    const engine = new FakeEngine();
    await formatJsFragment(engine, 'statements', 'const a = 1;', 4, false, options());
    expect(engine.requests[0]).toEqual({
      language: 'ts',
      source: 'const a = 1;',
      indentColumns: 4,
      singleQuote: false,
    });
  });
});

describe('the oxfmt engine', () => {
  it('never asks for fewer columns than it can print in', async () => {
    // Deep nesting would otherwise drive the width to zero, and a formatter with no columns
    // breaks after every token.
    const deep = await oxfmtEngine.format(
      { language: 'ts', source: 'const a = { one: 1, two: 2, three: 3, four: 4 };', indentColumns: 400, singleQuote: false },
      options(),
    );
    expect(deep.code.split('\n').length).toBeGreaterThan(1);
    expect(deep.ok).toBe(true);
  });

  it('honours tabs and tab width', async () => {
    const tabbed = await oxfmtEngine.format(
      { language: 'ts', source: 'function f() {\nreturn 1;\n}', indentColumns: 0, singleQuote: false },
      options({ useTabs: true }),
    );
    expect(tabbed.code).toContain('\treturn 1;');
  });

  it('formats CSS through the same door', async () => {
    const css = await oxfmtEngine.format(
      { language: 'css', source: '.a{color:red}', indentColumns: 0, singleQuote: false },
      options(),
    );
    expect(css).toEqual({ code: '.a {\n  color: red;\n}', ok: true });
  });
});
