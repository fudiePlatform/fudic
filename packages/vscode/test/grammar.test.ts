/**
 * The TextMate grammar (SDD-25 §4.2, criterion §6.2).
 *
 * What is asserted here is *where each region begins and ends*, not what colour a
 * TypeScript keyword ends up. The embedded grammars are empty on purpose (see
 * `_tokenize.ts`): the boundaries are what this extension contributes, and the boundaries
 * are what breaks.
 *
 * The bar §4.2 sets is explicit: the grammar is allowed to be imprecise on `@` transitions
 * — the real disambiguation needs the delimiter balancer, which no regular expression can
 * express, and the server's semantic tokens correct it a hundred milliseconds later. What
 * it is *not* allowed to do is bleed.
 */

import { describe, expect, it } from 'vitest';
import { find, findAll, findExact, fixture, has, tokenize, trailingScopes } from './_tokenize.js';

describe('code regions', () => {
  it('opens @code as a directive and its body as TypeScript', async () => {
    const tokens = await tokenize('@code {\n  const a = 1;\n}\n');

    expect(has(find(tokens, 'code'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'const a'), 'source.ts')).toBe(true);
  });

  it('marks @server and @client inside @code', async () => {
    const tokens = await tokenize('@code {\n  @server {\n    const a = 1;\n  }\n  @client {\n    const b = 2;\n  }\n}\n');

    expect(has(find(tokens, 'server'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'client'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'const b'), 'source.ts')).toBe(true);
  });

  it('closes @code on its own brace, not on the first brace of the code inside', async () => {
    // The whole difficulty of this grammar in one case. A regular expression cannot balance
    // braces, so nested blocks are consumed by a recursive rule before the closing pattern
    // ever sees them. Without it, `if (…) { … }` inside @code would end the region early and
    // every line after it would be markup.
    const tokens = await tokenize('@code {\n  function f() {\n    if (a) { return 1; }\n  }\n}\n<p>after</p>\n');

    expect(has(find(tokens, 'return 1'), 'source.ts')).toBe(true);
    expect(has(find(tokens, 'after'), 'source.ts')).toBe(false);
    expect(has(find(tokens, 'p'), 'entity.name.tag')).toBe(true);
  });

  it('does not let a brace inside a string or a comment close the region', async () => {
    const tokens = await tokenize('@code {\n  const s = "}";\n  // }\n  const t = 2;\n}\n<p>after</p>\n');

    expect(has(find(tokens, 'const t'), 'source.ts')).toBe(true);
    expect(has(find(tokens, 'after'), 'source.ts')).toBe(false);
  });

  it('projects a bare @{ … } statement block as TypeScript', async () => {
    const tokens = await tokenize('<p>x</p>\n@{ const a = 1; }\n<p>y</p>\n');

    expect(has(find(tokens, 'const a'), 'source.ts')).toBe(true);
    expect(has(find(tokens, 'y'), 'source.ts')).toBe(false);
  });
});

describe('embedded elements', () => {
  it('gives <style> content to CSS', async () => {
    const tokens = await tokenize('<style>\n  :host { display: block; }\n</style>\n<p>after</p>\n');

    expect(has(find(tokens, ':host'), 'source.css')).toBe(true);
    expect(has(find(tokens, 'after'), 'source.css')).toBe(false);
  });

  it('keeps CSS at-rules out of the Razor transition', async () => {
    // `@media` is CSS, not an interpolation. Without this the whole grammar would read the
    // most common at-rule in any stylesheet as a Fudic expression.
    const tokens = await tokenize('<style>\n  @media (min-width: 40em) { :host { display: flex; } }\n</style>\n');
    const media = find(tokens, 'media');

    expect(has(media, 'keyword.control.at-rule')).toBe(true);
    expect(has(media, 'meta.interpolation')).toBe(false);
  });

  it('still sees a Razor region inside CSS', async () => {
    const tokens = await tokenize('<style>\n  .x { width: @(size)px; }\n</style>\n');

    expect(has(find(tokens, 'size'), 'meta.interpolation')).toBe(true);
  });

  it('gives <script> content to JavaScript and leaves its @ alone', async () => {
    // Decision 43: script is raw. An `@` in there is a decorator or an email, never a
    // directive, and treating it as one would corrupt the one region users paste into.
    const tokens = await tokenize('<script>\n  const a = 1; // x@y\n</script>\n');
    const body = find(tokens, 'const a');

    expect(has(body, 'source.js')).toBe(true);
    expect(has(body, 'meta.interpolation')).toBe(false);
  });
});

describe('markup', () => {
  it('scopes a native tag, its attribute and its value', async () => {
    const tokens = await tokenize('<a href="/x">y</a>\n');

    expect(has(find(tokens, 'a'), 'entity.name.tag')).toBe(true);
    expect(has(find(tokens, 'href'), 'entity.other.attribute-name')).toBe(true);
    expect(has(find(tokens, '/x'), 'string.quoted')).toBe(true);
  });

  it('separates a custom element from a native one', async () => {
    // TextMate cannot know whether a tag resolves to a `.fud` — that is what the server's
    // semantic tokens are for (criterion 3). What it can know is the dash, and a dash is a
    // custom element by specification.
    const tokens = await tokenize('<app-badge></app-badge>\n<div></div>\n');

    expect(has(find(tokens, 'app-badge'), 'entity.name.tag.custom')).toBe(true);
    expect(has(find(tokens, 'div'), 'entity.name.tag.custom')).toBe(false);
    expect(has(find(tokens, 'div'), 'entity.name.tag')).toBe(true);
  });

  it('scopes an HTML comment', async () => {
    const tokens = await tokenize('<!-- hidden -->\n<p>after</p>\n');

    expect(has(find(tokens, 'hidden'), 'comment')).toBe(true);
    expect(has(find(tokens, 'after'), 'comment')).toBe(false);
  });

  it('ends an unclosed tag at the next one instead of running away', async () => {
    // An anti-bleed guard, not a nicety: while a tag is being typed the document is
    // permanently in this state, and a rule with no way out colours the rest of the file.
    const tokens = await tokenize('<div class="a"\n<p>after</p>\n');

    expect(has(find(tokens, 'after'), 'meta.tag')).toBe(false);
  });
});

describe('control directives', () => {
  it('scopes the keyword and hands the header to TypeScript', async () => {
    const tokens = await tokenize('@if (a > 0) {\n  <p>y</p>\n}\n');

    expect(has(find(tokens, 'if'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'a > 0'), 'source.ts')).toBe(true);
  });

  it('covers every control keyword', async () => {
    for (const keyword of ['if', 'foreach', 'for', 'while', 'switch']) {
      const tokens = await tokenize(`@${keyword} (x) {\n  <p>y</p>\n}\n`);
      expect(has(find(tokens, keyword), 'keyword.control.directive')).toBe(true);
    }
  });

  it('keeps markup inside a control body as markup', async () => {
    const tokens = await tokenize('@foreach (const p of ps) {\n  <app-badge>@p.tag</app-badge>\n}\n');

    expect(has(find(tokens, 'app-badge'), 'entity.name.tag.custom')).toBe(true);
    expect(has(find(tokens, 'p.tag'), 'meta.interpolation')).toBe(true);
  });

  it('reads `} else {` as a continuation, not as the end of the file', async () => {
    // If the closing brace of the @if branch ended the region, `else` would be loose text
    // and the block after it would be one level out. If it did not end it, the fold and the
    // scope would run to the end of the file. It has to be exactly a continuation.
    const tokens = await tokenize('@if (a) {\n  <p>x</p>\n} else {\n  <p>y</p>\n}\n<p>after</p>\n');

    expect(has(find(tokens, 'else'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'after'), 'meta.block.control')).toBe(false);
  });

  it('scopes @section and its name', async () => {
    const tokens = await tokenize('@section nav {\n  <p>y</p>\n}\n');

    expect(has(find(tokens, 'section'), 'keyword.control.directive')).toBe(true);
    expect(has(find(tokens, 'nav'), 'entity.name.section')).toBe(true);
  });
});

describe('bindings', () => {
  it('separates class: and style: from a plain attribute', async () => {
    const tokens = await tokenize('<p class="a" class:b="@(c)" style:top="@(d)"></p>\n');

    expect(has(find(tokens, 'class'), 'entity.other.attribute-name.binding')).toBe(false);
    expect(findAll(tokens, 'class').some((t) => has(t, 'entity.other.attribute-name.binding'))).toBe(
      true,
    );
    expect(has(find(tokens, 'style'), 'entity.other.attribute-name.binding')).toBe(true);
  });

  it('scopes .prop, @event and ref', async () => {
    const tokens = await tokenize('<p .value="@(v)" @click="@(f)" ref="el"></p>\n');

    expect(has(find(tokens, 'value'), 'entity.other.attribute-name.binding.property')).toBe(true);
    expect(has(find(tokens, 'click'), 'entity.other.attribute-name.binding.event')).toBe(true);
    expect(has(find(tokens, 'ref'), 'entity.other.attribute-name.binding.ref')).toBe(true);
  });
});

describe('interpolation, escape and comment', () => {
  it('delimits @( … ) and lets it nest parentheses', async () => {
    const tokens = await tokenize('<p>@(f(g(x)) + 1)</p>\n');

    // ` + 1` sits *after* two nested closing parens: if either of them had been taken for
    // the end of the interpolation, this token would be plain text and the `)` left over
    // would leak into the markup.
    expect(has(find(tokens, ' + 1'), 'meta.interpolation')).toBe(true);
    expect(has(findExact(tokens, 'p'), 'meta.interpolation')).toBe(false);
  });

  it('reads an implicit @ident.path', async () => {
    const tokens = await tokenize('<p>@data.title x</p>\n');
    const path = find(tokens, 'data.title');

    expect(has(path, 'meta.interpolation.implicit')).toBe(true);
    expect(has(find(tokens, ' x'), 'meta.interpolation')).toBe(false);
  });

  it('treats @@ as an escape and not as the start of an expression', async () => {
    const tokens = await tokenize('<p>@@media</p>\n');

    expect(has(find(tokens, '@@'), 'constant.character.escape')).toBe(true);
    expect(has(find(tokens, 'media'), 'meta.interpolation')).toBe(false);
  });

  it('scopes @* … *@ as a comment and comes back afterwards', async () => {
    const tokens = await tokenize('@* note @data.x *@\n<p>after</p>\n');

    expect(has(find(tokens, 'note'), 'comment')).toBe(true);
    expect(has(find(tokens, 'after'), 'comment')).toBe(false);
  });

  it('leaves the @ of an email alone', async () => {
    // Decision 7. An `@` preceded by an identifier character is literal, and this is the
    // single most common way a naive Razor grammar corrupts an ordinary page.
    const tokens = await tokenize('<p>pedro@gmail.com</p>\n');

    expect(findAll(tokens, 'gmail').some((t) => has(t, 'meta.interpolation'))).toBe(false);
  });
});

describe('the corpus', () => {
  const corpus = ['blog/[slug].fud', 'components/app-badge.fud'] as const;

  it('colours [slug].fud: TypeScript in @code, markup outside, directives apart', async () => {
    const tokens = await tokenize(fixture('blog/[slug].fud'));

    expect(has(find(tokens, 'export async function load'), 'source.ts')).toBe(true);
    expect(has(findExact(tokens, 'server'), 'keyword.control.directive')).toBe(true);
    expect(has(findExact(tokens, 'nav'), 'entity.name.section')).toBe(true);
    expect(has(findExact(tokens, 'app-badge'), 'entity.name.tag.custom')).toBe(true);
    expect(has(findExact(tokens, 'data.tag'), 'meta.interpolation')).toBe(true);
    // The markup after the code block is markup again — the region really did close.
    expect(has(findExact(tokens, 'article'), 'source.ts')).toBe(false);
  });

  it('colours app-badge.fud: CSS in <style>, bindings on the span', async () => {
    const tokens = await tokenize(fixture('components/app-badge.fud'));

    expect(has(find(tokens, ':host'), 'source.css')).toBe(true);
    expect(has(find(tokens, 'type Tone'), 'source.ts')).toBe(true);
    expect(findAll(tokens, 'success').some((t) => has(t, 'entity.other.attribute-name.binding'))).toBe(
      true,
    );
  });

  it.each(corpus)('does not bleed to the end of %s', async (name) => {
    // Criterion 6.2, and the only one the SDD states as a hard bar. Everything above can be
    // approximate; this cannot. A probe appended after the file has to come back to the
    // base scope — if any rule is still open at EOF, it will not.
    expect(await trailingScopes(fixture(name))).toEqual(['text.html.fudic']);
  });

  it.each([
    ['an unterminated attribute value', '<p class="a\n<p>after</p>\n'],
    ['an unclosed opening tag', '<div class="a"\n<p>after</p>\n'],
    ['a stray @ in prose', '<p>a @ b</p>\n<p>after</p>\n'],
    ['an unmatched closing brace', '}\n<p>after</p>\n'],
  ])('recovers from %s', async (_name, source) => {
    // These are not exotic inputs: every one of them is a document mid-keystroke. A grammar
    // that only behaves on finished files is a grammar that misbehaves all day. Each of
    // these constructs has a way out — end of line, the next `<` — and has to take it.
    expect(await trailingScopes(source)).toEqual(['text.html.fudic']);
  });

  it('leaves a genuinely unclosed block open, which is the language and not bleed', async () => {
    // Worth stating, because it looks like the failure above and is its opposite. An `@if`
    // with no closing brace *is* open; every language colours the rest of the file as its
    // body. Bleed is a construct that had a terminator and missed it — not one whose
    // terminator the user has yet to type.
    expect(await trailingScopes('@if (a) {\n  <p>x</p>\n')).toContain('meta.block.control.fudic');
  });
});
