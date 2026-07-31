import { describe, expect, it } from 'vitest';
import {
  dedent,
  formatJsFragment,
  oxfmtEngine,
  unwrapFragment,
  wrapFragment,
} from '../../src/leaf/index.js';
import { FakeEngine, options } from '../_support.js';

/** A newline, named: these tests are full of strings that must not contain one. */
const BREAK = String.fromCharCode(10);

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
  const fragment = (over: Record<string, unknown>) => ({
    kind: 'expression' as const,
    source: '',
    indentColumns: 0,
    singleQuote: false,
    singleLine: false,
    ...over,
  });

  it('formats through the engine and comes back without the sentinel', async () => {
    const out = await formatJsFragment(
      oxfmtEngine,
      fragment({ kind: 'condition', source: 'x>0&&y' }),
      options(),
    );
    expect(out).toEqual({ text: 'x > 0 && y', ok: true });
  });

  it('formats a real ternary, a real for-of and a real @code body', async () => {
    const o = options();
    const run = async (over: Record<string, unknown>): Promise<string> =>
      (await formatJsFragment(oxfmtEngine, fragment(over), o)).text;
    expect(await run({ source: "a?'x':'y'" })).toBe('a ? "x" : "y"');
    expect(await run({ kind: 'iteration', source: 'const item of data.items' })).toBe(
      'const item of data.items',
    );
    expect(await run({ kind: 'statements', source: 'const  a={b:1}' })).toBe(
      'const a = { b: 1 };',
    );
  });

  it('takes the quote its container did not, when asked', async () => {
    const out = await formatJsFragment(
      oxfmtEngine,
      fragment({ source: "a?'x':'y'", singleQuote: true }),
      options(),
    );
    expect(out.text).toBe("a ? 'x' : 'y'");
  });

  it('keeps a fragment that must not break on one line', async () => {
    // The margin is not the right question inside an attribute: it is delimited by quotes.
    const source = "someRatherLongName === 'a value that would not fit' ? 'yes' : 'no'";
    const wide = await formatJsFragment(
      oxfmtEngine,
      fragment({ source, singleLine: true, singleQuote: true }),
      options({ printWidth: 20 }),
    );
    expect(wide.text).not.toContain(BREAK);
    // And it was FORMATTED, not merely returned: asking for a width the engine rejects comes
    // back as an error, which reads as "it does not parse" — every binding in the corpus
    // silently kept whatever spacing its author typed.
    expect(wide.ok).toBe(true);
    expect(
      (
        await formatJsFragment(
          oxfmtEngine,
          fragment({ source: "a===   'x'", singleLine: true, singleQuote: true }),
          options({ printWidth: 20 }),
        )
      ).text,
    ).toBe("a === 'x'");

    const broken = await formatJsFragment(
      oxfmtEngine,
      fragment({ source, singleLine: false }),
      options({ printWidth: 20 }),
    );
    expect(broken.text).toContain(BREAK);
  });

  it('falls back to what the author wrote when one line turns out impossible', async () => {
    // Something inside forced a break no width can undo. The source wins: a binding is
    // never broken from within, and this is the only place that promise can be kept.
    const engine = new FakeEngine(() => ({ code: `(a${BREAK}? b${BREAK}: c);`, ok: true }));
    const out = await formatJsFragment(
      engine,
      fragment({ source: 'a ? b : c', singleLine: true }),
      options(),
    );
    expect(out).toEqual({ text: 'a ? b : c', ok: true });
  });

  it('but not when the author had already broken it themselves', async () => {
    // Their newline is a run like any other: rewriting it is allowed, removing it is not.
    const engine = new FakeEngine(() => ({ code: `(a${BREAK}? b${BREAK}: c);`, ok: true }));
    const out = await formatJsFragment(
      engine,
      fragment({ source: `a${BREAK}? b : c`, singleLine: true }),
      options(),
    );
    expect(out.text).toContain(BREAK);
  });

  it('leaves a fragment that does not parse exactly as written, and says so', async () => {
    const out = await formatJsFragment(oxfmtEngine, fragment({ source: 'a ===' }), options());
    expect(out).toEqual({ text: 'a ===', ok: false });
  });

  it('never asks the engine about an empty fragment', async () => {
    // `@()` is legal to type: wrapping it would manufacture a syntax error out of nothing.
    const engine = new FakeEngine();
    expect(await formatJsFragment(engine, fragment({ source: '  ' }), options())).toEqual({
      text: '  ',
      ok: true,
    });
    expect(engine.requests).toHaveLength(0);
  });

  it('asks for the width that will be left once the fragment is indented', async () => {
    const engine = new FakeEngine();
    await formatJsFragment(
      engine,
      fragment({ kind: 'statements', source: 'const a = 1;', indentColumns: 4 }),
      options(),
    );
    expect(engine.requests[0]).toEqual({
      language: 'ts',
      source: 'const a = 1;',
      indentColumns: 4,
      singleQuote: false,
      singleLine: false,
    });
  });
});

describe('the oxfmt engine', () => {
  it('never asks for fewer columns than it can print in', async () => {
    // Deep nesting would otherwise drive the width to zero, and a formatter with no columns
    // breaks after every token.
    const deep = await oxfmtEngine.format(
      { language: 'ts', source: 'const a = { one: 1, two: 2, three: 3, four: 4 };', indentColumns: 400, singleQuote: false, singleLine: false },
      options(),
    );
    expect(deep.code.split('\n').length).toBeGreaterThan(1);
    expect(deep.ok).toBe(true);
  });

  it('never asks for more columns than it accepts either', async () => {
    // The engine validates its configuration and refuses a width over 320. A refusal comes
    // back as an error, so an option nobody thought twice about would turn every fragment of
    // the file into "does not parse" — and the file would come out with its JS untouched.
    const wide = await oxfmtEngine.format(
      { language: 'ts', source: 'const  a = 1;', indentColumns: 0, singleQuote: false, singleLine: false },
      options({ printWidth: 400 }),
    );
    expect(wide).toEqual({ code: 'const a = 1;', ok: true });
  });

  it('honours tabs and tab width', async () => {
    const tabbed = await oxfmtEngine.format(
      { language: 'ts', source: 'function f() {\nreturn 1;\n}', indentColumns: 0, singleQuote: false, singleLine: false },
      options({ useTabs: true }),
    );
    expect(tabbed.code).toContain('\treturn 1;');
  });

  it('formats CSS through the same door', async () => {
    const css = await oxfmtEngine.format(
      { language: 'css', source: '.a{color:red}', indentColumns: 0, singleQuote: false, singleLine: false },
      options(),
    );
    expect(css).toEqual({ code: '.a {\n  color: red;\n}', ok: true });
  });
});
