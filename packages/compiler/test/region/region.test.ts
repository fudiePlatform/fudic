/**
 * BUG-22: where an offset IS, answered from the tree.
 *
 * Every case is written with a `|` where the caret sits, so the test reads like the file the
 * user is looking at. The whole point of the module is that the answer survives half-typed
 * markup, so most of these sources do not parse cleanly — and that is deliberate.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { parseDirective } from '../../src/layout/index.js';
import { attributeValueSpan, regionAt, type Region } from '../../src/region/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

/** The region under the `|` of `marked`. */
function at(marked: string): Region {
  const offset = marked.indexOf('|');
  if (offset === -1) throw new Error('the source needs a | caret');

  const source = marked.replace('|', '');
  const document = parseDocument(source, { atConstructs: constructs }).value;
  return regionAt(source, document, offset);
}

/** The kind under the caret. */
const kindAt = (marked: string): string => at(marked).kind;

/** The source stretch the region covers. */
function textAt(marked: string): string {
  const region = at(marked);
  return marked.replace('|', '').slice(region.span.start, region.span.end);
}

describe('regionAt — markup', () => {
  it('text between tags is markup', () => {
    expect(kindAt('<app-x><p>ho|la</p></app-x>')).toBe('markup');
  });

  it('a file with nothing parsed is still markup', () => {
    expect(kindAt('|')).toBe('markup');
  });

  it('text at the top level is markup', () => {
    expect(kindAt('ho|la')).toBe('markup');
  });

  it('a comment is markup', () => {
    expect(kindAt('<p><!-- ho|la --></p>')).toBe('markup');
  });

  it('the element that owns the text travels with the answer', () => {
    expect(at('<section><p>ho|la</p></section>').element?.name).toBe('p');
  });

  it('a close tag that matches no open element leaves markup behind', () => {
    // `</span>` is consumed with FUD0051 and produces no node: the offset is inside <div>
    // and inside none of its children, which is the case the fallback exists for.
    expect(kindAt('<div></sp|an>hola</div>')).toBe('markup');
  });
});

describe('regionAt — tags', () => {
  it('inside a start tag', () => {
    expect(kindAt('<div |class="a"></div>')).toBe('tag');
  });

  it('on the tag name', () => {
    expect(kindAt('<di|v></div>')).toBe('tag');
  });

  it('on an attribute name', () => {
    expect(kindAt('<div cla|ss="a"></div>')).toBe('tag');
  });

  it('the attribute under the caret travels with the answer', () => {
    expect(at('<div cla|ss="a"></div>').attribute?.name).toBe('class');
  });

  it('inside a close tag', () => {
    expect(kindAt('<div></di|v>')).toBe('tag');
  });

  it('a boolean attribute has no value to be inside of', () => {
    expect(kindAt('<input disab|led>')).toBe('tag');
  });

  it('a start tag with no `>` yet still answers tag', () => {
    expect(kindAt('<div class="a" |')).toBe('tag');
  });

  it('and covers everything the lexer read in tag mode', () => {
    expect(textAt('<div |')).toBe('<div ');
  });

  it('a self-closing tag is all tag', () => {
    expect(kindAt('<app-x .a="1"| />')).toBe('tag');
  });
});

describe('regionAt — attribute values', () => {
  it('inside the quotes', () => {
    expect(kindAt('<div class="ba|dge"></div>')).toBe('attr-value');
  });

  it('an empty value is a position of its own', () => {
    expect(kindAt('<link rel="component" href="|">')).toBe('attr-value');
  });

  it('a `>` inside a value does not end the tag', () => {
    // The regression BUG-22 is about: a backwards text scan reads this as markup.
    expect(kindAt('<div title="a > b" cla|ss="x"></div>')).toBe('tag');
  });

  it('and the caret inside that value is a value, not markup', () => {
    expect(kindAt('<div title="a >| b"></div>')).toBe('attr-value');
  });

  it('an unquoted value is still a value', () => {
    expect(kindAt('<div class=ba|dge></div>')).toBe('attr-value');
  });

  it('an unterminated value runs to where recovery stopped', () => {
    expect(kindAt('<div class="ba|dge')).toBe('attr-value');
  });

  it('a Razor atom inside a value is an expression', () => {
    expect(kindAt('<app-x .tone="@(to|ne === 1)"></app-x>')).toBe('expression');
  });

  it('the literal run beside it is not', () => {
    expect(kindAt('<app-x .tone="a|b@(tone)"></app-x>')).toBe('attr-value');
  });

  it('an event named by an expression is an expression', () => {
    expect(kindAt('<app-x bus:(EVEN|TS.cart)="@h"></app-x>')).toBe('expression');
  });

  it('but the value of that same attribute is not', () => {
    expect(kindAt('<app-x bus:(EVENTS.cart)="@|h"></app-x>')).toBe('expression');
  });
});

describe('regionAt — expressions', () => {
  it('an implicit expression in markup', () => {
    expect(kindAt('<p>@data.ti|tle</p>')).toBe('expression');
  });

  it('an explicit expression in markup', () => {
    expect(kindAt('<p>@(a +| b)</p>')).toBe('expression');
  });

  it('a raw expression', () => {
    expect(kindAt('<p>@raw(bo|dy)</p>')).toBe('expression');
  });

  it('the `@` that opens one is still markup: that is where a directive is typed', () => {
    expect(kindAt('<p>|@data.title</p>')).toBe('markup');
  });

  it('and the `@` of a @raw too', () => {
    expect(kindAt('<p>|@raw(body)</p>')).toBe('markup');
  });

  it('the `@@` escape is markup, not an expression', () => {
    expect(kindAt('<p>@|@</p>')).toBe('markup');
  });

  it('a Razor comment is markup', () => {
    expect(kindAt('<p>@* ho|la *@</p>')).toBe('markup');
  });
});

describe('regionAt — TypeScript', () => {
  it('inside @code', () => {
    expect(kindAt('@code {\n  const a| = 1;\n}\n<app-x></app-x>')).toBe('ts');
  });

  it('inside @server', () => {
    expect(kindAt('@code {\n  @server {\n    const a| = 1;\n  }\n}')).toBe('ts');
  });

  it('inside @client', () => {
    expect(kindAt('@code {\n  @client {\n    const a| = 1;\n  }\n}')).toBe('ts');
  });

  it('on the `@code` marker itself, with the block as its stretch', () => {
    expect(kindAt('@co|de {\n  const a = 1;\n}')).toBe('ts');
  });

  it('inside an inline @{ } block', () => {
    expect(kindAt('<p>@{ const a| = 1; }</p>')).toBe('ts');
  });

  it('inside a <script>', () => {
    expect(kindAt('<div><script>const a| = 1;</script></div>')).toBe('ts');
  });
});

describe('regionAt — CSS', () => {
  it('inside a <style>', () => {
    expect(kindAt('<head><style>:host { disp|lay: block; }</style></head>')).toBe('css');
  });

  it('a Razor atom inside CSS is an expression', () => {
    expect(kindAt('<head><style>.a { color: @(to|ne); }</style></head>')).toBe('expression');
  });

  it('the <style> tag itself is a tag', () => {
    expect(kindAt('<head><sty|le>:host { display: block; }</style></head>')).toBe('tag');
  });
});

describe('regionAt — control constructs', () => {
  it('the header of @if is an expression', () => {
    expect(kindAt('@if (a >| 1) { <p>x</p> }')).toBe('expression');
  });

  it('the body of @if is markup', () => {
    expect(kindAt('@if (a) { <p>x|y</p> }')).toBe('markup');
  });

  it('the body of an else is markup', () => {
    expect(kindAt('@if (a) { <p>x</p> } else { <p>y|z</p> }')).toBe('markup');
  });

  it('an else-if header is an expression', () => {
    expect(kindAt('@if (a) { <p>x</p> } else if (b >| 1) { <p>y</p> }')).toBe('expression');
  });

  it('the braces of @if belong to nobody in particular', () => {
    expect(kindAt('@if (a) |{ <p>x</p> }')).toBe('markup');
  });

  it('the header of @foreach is an expression', () => {
    expect(kindAt('@foreach (const x of x|s) { <p>y</p> }')).toBe('expression');
  });

  it('the body of @foreach is markup', () => {
    expect(kindAt('@foreach (const x of xs) { <p>y|z</p> }')).toBe('markup');
  });

  it('a key clause is an expression', () => {
    expect(kindAt('@foreach (const x of xs) key (x.i|d) { <p>y</p> }')).toBe('expression');
  });

  it('the header of @for is an expression', () => {
    expect(kindAt('@for (let i = 0; i < |n; i++) { <p>y</p> }')).toBe('expression');
  });

  it('the header of @while is an expression', () => {
    expect(kindAt('@while (a <| 1) { <p>y</p> }')).toBe('expression');
  });

  it('the discriminant of @switch is an expression', () => {
    expect(kindAt('@switch (to|ne) { case 1: <p>y</p> }')).toBe('expression');
  });

  it('a case test is an expression', () => {
    expect(kindAt('@switch (tone) { case 1 +| 1: <p>y</p> }')).toBe('expression');
  });

  it('a case body is markup', () => {
    expect(kindAt('@switch (tone) { case 1: <p>y|z</p> }')).toBe('markup');
  });

  it('the tail of a @switch belongs to nobody in particular', () => {
    expect(kindAt('@switch (tone) { case 1: <p>y</p> |}')).toBe('markup');
  });
});

describe('regionAt — layout directives', () => {
  it('the body of a @section is markup', () => {
    expect(kindAt('<link rel="layout" href="./l.fud">\n@section nav { <p>x|y</p> }')).toBe(
      'markup',
    );
  });

  it('a @section with the caret on its own braces is markup', () => {
    expect(kindAt('<link rel="layout" href="./l.fud">\n@section nav |{ <p>x</p> }')).toBe('markup');
  });

  it('@RenderBody is markup', () => {
    expect(kindAt('<!DOCTYPE html>\n<html><body>@Render|Body()</body></html>')).toBe('markup');
  });
});

describe('attributeValueSpan', () => {
  const spanOf = (source: string): string | undefined => {
    const document = parseDocument(source, { atConstructs: constructs }).value;
    const element = document.children.find((child) => child.type === 'element');
    if (element === undefined || element.type !== 'element') throw new Error('no element');

    const attribute = element.attributes[0];
    if (attribute === undefined) throw new Error('no attribute');

    const value = attributeValueSpan(source, attribute);
    return value === undefined ? undefined : source.slice(value.start, value.end);
  };

  it('a quoted value, without its quotes', () => {
    expect(spanOf('<div class="badge"></div>')).toBe('badge');
  });

  it('an empty quoted value', () => {
    expect(spanOf('<div class=""></div>')).toBe('');
  });

  it('an unquoted value', () => {
    expect(spanOf('<div class=badge></div>')).toBe('badge');
  });

  it('an unterminated quoted value keeps what was typed', () => {
    expect(spanOf('<div class="badge')).toBe('badge');
  });

  it('a boolean attribute has none', () => {
    expect(spanOf('<input disabled>')).toBeUndefined();
  });
});
