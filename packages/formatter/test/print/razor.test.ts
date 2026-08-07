import { describe, expect, it } from 'vitest';
import { formatWith } from '../../src/format.js';
import { FakeEngine } from '../_support.js';

/** Print with an engine that hands every fragment back untouched: this is about the shape. */
async function print(source: string, printWidth = 100): Promise<string> {
  const result = await formatWith(new FakeEngine(), source, { printWidth });
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.diagnostics)}`);
  return result.text;
}

describe('interpolation', () => {
  it('prints the implicit and the explicit form as they are written', async () => {
    expect(await print('<p>@data.title</p>')).toBe('<p>@data.title</p>\n');
    expect(await print('<p>@(a ? b : c)</p>')).toBe('<p>@(a ? b : c)</p>\n');
    expect(await print('<p>@raw(html)</p>')).toBe('<p>@raw(html)</p>\n');
  });
});

describe('control flow', () => {
  it('opens with the brace on the keyword line and closes with } else {', async () => {
    const source = '@if (a) {\n  <p>x</p>\n} else {\n  <p>y</p>\n}';
    expect(await print(source)).toBe(source + '\n');
  });

  it('prints every arm of an if / else if / else', async () => {
    const source = '@if (a) {\n  <p>x</p>\n} else if (b) {\n  <p>y</p>\n} else {\n  <p>z</p>\n}';
    expect(await print(source)).toBe(source + '\n');
  });

  it('normalizes the shape of a chain written any other way', async () => {
    expect(await print('@if (a) {\n  <p>x</p>\n}\nelse\n{\n  <p>y</p>\n}')).toBe(
      '@if (a) {\n  <p>x</p>\n} else {\n  <p>y</p>\n}\n',
    );
  });

  it('keeps an @if with no else', async () => {
    expect(await print('@if (a) {\n  <p>x</p>\n}')).toBe('@if (a) {\n  <p>x</p>\n}\n');
  });

  it('keeps a one-line body on one line: there is a run there, not a rule', async () => {
    expect(await print('@if (a) { <p>x</p> }')).toBe('@if (a) { <p>x</p> }\n');
  });

  it('prints the three loops', async () => {
    const foreach = '@foreach (const i of xs) key (i) {\n  <p>@i</p>\n}';
    const forLoop = '@for (let i = 0; i < 3; i++) key (i) {\n  <p>@i</p>\n}';
    const whileLoop = '@while (go) key (go.id) {\n  <p>x</p>\n}';
    expect(await print(foreach)).toBe(foreach + '\n');
    expect(await print(forLoop)).toBe(forLoop + '\n');
    expect(await print(whileLoop)).toBe(whileLoop + '\n');
  });

  it('prints a @switch with its case and default labels', async () => {
    const source = '@switch (t) {\n  case 1:\n    <p>a</p>\n  default:\n    <p>b</p>\n}';
    expect(await print(source)).toBe(source + '\n');
  });
});

describe('Razor comments in the two positions the parser skips', () => {
  it('keeps the one between } and else — acceptance criterion 7', async () => {
    const source = '@if (a) {\n  <p>x</p>\n} @* keep me *@ else {\n  <p>y</p>\n}';
    expect(await print(source)).toContain('@* keep me *@');
  });

  it('keeps the one between } and else if', async () => {
    const source = '@if (a) {\n  <p>x</p>\n} @* one *@ else if (b) {\n  <p>y</p>\n}';
    expect(await print(source)).toContain('@* one *@');
  });

  it('keeps the ones inside a @switch, before, between and after the labels', async () => {
    const source = [
      '@switch (t) { @* first *@',
      '  case 1:',
      '    <p>a</p>',
      '  @* middle *@',
      '  default:',
      '    <p>b</p>',
      '  @* last *@',
      '}',
    ].join('\n');
    const out = await print(source);
    expect(out).toContain('@* first *@');
    expect(out).toContain('@* middle *@');
    expect(out).toContain('@* last *@');
  });
});

describe('code', () => {
  it('prints a @code with its neutral chunk', async () => {
    expect(await print('@code {\n  const a = 1;\n}')).toBe('@code {\n  const a = 1;\n}\n');
  });

  it('keeps the blank line between a chunk and a region, and adds one when there is none', async () => {
    expect(await print('@code {\n  const a = 1;\n\n  @server {\n    const b = 2;\n  }\n}')).toBe(
      '@code {\n  const a = 1;\n\n  @server {\n    const b = 2;\n  }\n}\n',
    );
    expect(await print('@code {\n  const a = 1;\n  @client {\n    const b = 2;\n  }\n}')).toBe(
      '@code {\n  const a = 1;\n  @client {\n    const b = 2;\n  }\n}\n',
    );
  });

  it('prints an empty @code and an empty region without inventing a body', async () => {
    expect(await print('@code { }')).toBe('@code {}\n');
    expect(await print('@code {\n  @server { }\n}')).toBe('@code {\n  @server {}\n}\n');
  });

  it('prints inline code on one line when it fits, and open when it does not', async () => {
    expect(await print('<p>@{ const a = 1; }</p>')).toBe('<p>@{ const a = 1; }</p>\n');
    expect(await print('<p>@{}</p>')).toBe('<p>@{}</p>\n');
    // One level in from the `<p>` that contains it, and its brace back at the `<p>`'s own.
    expect(await print('<p>@{ const someRatherLongName = 1; }</p>', 20)).toBe(
      '<p>@{\n    const someRatherLongName = 1;\n  }</p>\n',
    );
  });
});

describe('layout directives', () => {
  it('prints the markers verbatim and walks into a @section', async () => {
    const source = '@RenderHead()\n@RenderBody()\n@RenderSection(nav)';
    expect(await print(source)).toBe(source + '\n');
  });

  it('prints a @section with its body', async () => {
    const source = '@section nav {\n  <site-nav current="blog"></site-nav>\n}';
    expect(await print(source)).toBe(source + '\n');
  });
});

describe('style', () => {
  it('puts the body one level in', async () => {
    expect(await print('<style>\n.a{color:red}\n</style>')).toBe(
      '<style>\n  .a{color:red}\n</style>\n',
    );
  });

  it('prints an empty style with nothing between its tags', async () => {
    expect(await print('<style></style>')).toBe('<style></style>\n');
    expect(await print('<style>\n</style>')).toBe('<style></style>\n');
  });
});
