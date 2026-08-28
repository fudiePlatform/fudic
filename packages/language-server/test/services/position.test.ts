/**
 * What is under the cursor (SDD-24 §4.2, §6.3–§6.6).
 *
 * The empty `href=""` is the case that shapes this module: it is where completion is asked
 * for, and it has no value parts at all, so the span has to come from the attribute itself.
 */

import { describe, expect, it } from 'vitest';
import { regionAt, type Attribute } from '@fudic/compiler';
import { parseFud } from '../../src/parse.js';
import {
  attributeGapContextAt,
  attributeOf,
  attributeValueBindingAt,
  attributeValueSpan,
  bareBindingValueContextAt,
  brokenValueContextAt,
  classContextAt,
  classValueContextAt,
  directiveContextAt,
  eventContextAt,
  expressionValueContextAt,
  handlerContextAt,
  hrefContextAt,
  isEmptyDocument,
  linksOf,
  memberContextAt,
  nativeGapContextAt,
  ownedByProjection,
  propertyContextAt,
  sectionContextAt,
  slotValueContextAt,
  tagContextAt,
  tagNameAt,
  wordContextAt,
} from '../../src/services/position.js';
import { component, LAYOUT, NESTED_LAYOUT, PAGE, route } from '../_support.js';

const doc = (source: string) => parseFud(source).document;

/** The region the five text contexts are guarded by (BUG-22). */
const regionOf = (source: string, offset: number) =>
  regionAt(source, parseFud(source).html, offset);

describe('linksOf', () => {
  it('lists the component links of a component', () => {
    const links = linksOf(doc(component('app-card', ['./app-badge.fud', './site-nav.fud'])));

    expect(links.map((link) => link.rel)).toEqual(['component', 'component']);
  });

  it('adds the layout link of a route', () => {
    const links = linksOf(doc(route('../layouts/_layout.fud', ['../components/app-badge.fud'])));

    expect(links.map((link) => link.rel)).toEqual(['component', 'layout']);
  });

  it('adds the parent link of a nested layout, and nothing for a plain one', () => {
    expect(linksOf(doc(NESTED_LAYOUT)).map((link) => link.rel)).toEqual(['layout']);
    expect(linksOf(doc(LAYOUT))).toEqual([]);
    expect(linksOf(doc(PAGE))).toEqual([]);
  });
});

describe('attributeValueSpan', () => {
  const spanOf = (source: string, attribute = 'href') => {
    const [link] = linksOf(doc(source));
    const found = attributeOf(link!.element, attribute);
    return found === undefined ? undefined : attributeValueSpan(source, found);
  };

  it('is the text inside the quotes', () => {
    const source = `<link rel="component" href="./app-badge.fud">\n${component('app-x')}`;
    const value = spanOf(source);

    expect(source.slice(value?.start, value?.end)).toBe('./app-badge.fud');
  });

  it('is an empty span for href="" — a position, not a range', () => {
    const source = `<link rel="component" href="">\n${component('app-x')}`;
    const value = spanOf(source);

    expect(value?.start).toBe(value?.end);
    expect(source[(value?.start ?? 0) - 1]).toBe('"');
  });

  it('reaches to the end of an unquoted value', () => {
    const source = `<link rel=component href=./app-badge.fud>\n${component('app-x')}`;
    const value = spanOf(source);

    expect(source.slice(value?.start, value?.end)).toBe('./app-badge.fud');
  });

  it('reaches to the end of an unterminated value: a half-typed href still completes', () => {
    // The AST cannot be talked into this shape — the parser's recovery always finds some later
    // quote to close on — but a span that ends before its quote does is exactly what a
    // recovered attribute may hand over, and the value must still be the text the user typed.
    const source = 'href="./app-badge.fud';
    const attribute: Attribute = {
      type: 'attribute',
      name: 'href',
      value: [],
      span: { start: 0, end: source.length },
    };

    const value = attributeValueSpan(source, attribute);
    expect(source.slice(value?.start, value?.end)).toBe('./app-badge.fud');
  });

  it('is undefined for an attribute with no value at all', () => {
    const source = `<link rel="component" href>\n${component('app-x')}`;

    expect(spanOf(source)).toBeUndefined();
  });

  it('is undefined for an attribute this element does not have', () => {
    const source = `<link rel="component" href="./x.fud">\n${component('app-x')}`;

    expect(spanOf(source, 'media')).toBeUndefined();
  });
});

describe('hrefContextAt', () => {
  const source = `<link rel="component" href="./app-badge.fud">\n${component('app-x')}`;
  const at = source.indexOf('./app-badge.fud');

  it('answers inside the value', () => {
    const context = hrefContextAt(source, doc(source), at + 3);

    expect(context?.rel).toBe('component');
    expect(context?.text).toBe('./app-badge.fud');
  });

  it('answers at both ends, because a completion is asked for at a boundary', () => {
    expect(hrefContextAt(source, doc(source), at)).toBeDefined();
    expect(hrefContextAt(source, doc(source), at + './app-badge.fud'.length)).toBeDefined();
  });

  it('says nothing outside any href', () => {
    expect(hrefContextAt(source, doc(source), 2)).toBeUndefined();
    expect(hrefContextAt(source, doc(source), source.length - 2)).toBeUndefined();
  });

  it('recognizes the layout link of a route', () => {
    const routeSource = route('../layouts/_layout.fud');
    const offset = routeSource.indexOf('../layouts');

    expect(hrefContextAt(routeSource, doc(routeSource), offset + 1)?.rel).toBe('layout');
  });

  it('skips a link with no href instead of guessing', () => {
    const hrefless = `<link rel="component">\n${component('app-x')}`;

    expect(hrefContextAt(hrefless, doc(hrefless), 12)).toBeUndefined();
  });
});

describe('tagContextAt', () => {
  it.each([
    ['<', ''],
    ['<app-', 'app-'],
    ['<div>text <app-bad', 'app-bad'],
  ])('after %s completes %s', (prefix, expected) => {
    const context = tagContextAt(prefix, prefix.length);

    expect(context?.text).toBe(expected);
    expect(context?.span.end).toBe(prefix.length);
    expect(context?.span.start).toBe(prefix.length - expected.length);
  });

  it.each([['plain text'], ['<div> '], ['@if (x) {']])('says nothing at %s', (source) => {
    expect(tagContextAt(source, source.length)).toBeUndefined();
  });
});

describe('tagNameAt', () => {
  it.each([
    // The cursor anywhere in the name, and both ends of it, in an opening and a closing tag.
    ['<app-badge>', 1, 'app-badge'],
    ['<app-badge>', 5, 'app-badge'],
    ['<app-badge>', 10, 'app-badge'],
    ['</app-badge>', 4, 'app-badge'],
    ['<div><app-badge tone="x">', 8, 'app-badge'],
  ])('reads %s at %i as %s', (source, offset, expected) => {
    const name = tagNameAt(source, offset);

    expect(name?.text).toBe(expected);
    expect(source.slice(name?.span.start, name?.span.end)).toBe(expected);
  });

  it.each([
    // Not on a name at all: the delimiter itself, and whitespace.
    ['<app-badge>', 0],
    ['<app-badge> ', 12],
    // A word that opens nothing: plain text, a path, and an attribute value.
    ['plain text', 3],
    ['see a/app-badge', 10],
    ['<div class="app-badge">', 15],
  ])('says nothing in %s at %i', (source, offset) => {
    expect(tagNameAt(source, offset)).toBeUndefined();
  });
});

describe('sectionContextAt', () => {
  it.each([
    ['@section ', ''],
    ['@section na', 'na'],
    ['<div></div>\n@section\tnav', 'nav'],
  ])('after %s completes %s', (prefix, expected) => {
    expect(sectionContextAt(prefix, prefix.length)?.text).toBe(expected);
  });

  it.each([['@section'], ['@sections nav'], ['@if (x) {']])('says nothing at %s', (source) => {
    expect(sectionContextAt(source, source.length)).toBeUndefined();
  });
});

describe('classContextAt (BUG-15 §6.2)', () => {
  it.each([
    ['<span class:', ''],
    ['<span class:suc', 'suc'],
    ['<span class="badge" class:', ''],
    ['<span\n  class="badge"\n  class:in', 'in'],
    ['<span class:a="@(x)" class:b-c', 'b-c'],
  ])('reads %s as the partial name %s', (prefix, expected) => {
    const context = classContextAt(prefix, prefix.length, regionOf(prefix, prefix.length));

    // The span covers what was typed after the colon and nothing else: the prefix stays,
    // it is what opens the context.
    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // Same shape, different answer: their names come from somewhere else entirely (§7).
    ['<span style:'],
    ['<span bus:'],
    // The static attribute, not the directive.
    ['<span class="'],
    ['<span class="bad'],
    // Somebody else's string.
    ['<div title="class:'],
    ["<div title='class:fo"],
    // Markup text, not an attribute.
    ['<p>class:'],
    ['<p>hello class:foo'],
    ['class:'],
    // A name that merely ends in `class`.
    ['<span subclass:'],
    ['<span data-class:'],
  ])('says nothing at %s', (source) => {
    expect(classContextAt(source, source.length, regionOf(source, source.length))).toBeUndefined();
  });

  it('is the context again in the tag that follows a quoted one', () => {
    const source = '<div title="class:x"></div>\n<span class:su';

    expect(classContextAt(source, source.length, regionOf(source, source.length))?.text).toBe('su');
  });
});

describe('propertyContextAt and eventContextAt (BUG-16 §3.4)', () => {
  it.each([
    ['<app-badge .', ''],
    ['<app-badge .ton', 'ton'],
    ['<app-badge id="x" .', ''],
    ['<app-badge\n  .tone="@(t)"\n  .var', 'var'],
    ['<app-badge .data-id', 'data-id'],
  ])('reads the property being typed at %s as %s', (prefix, expected) => {
    const context = propertyContextAt(prefix, prefix.length, regionOf(prefix, prefix.length));

    // The dot stays out of the span: it is what opens the context, not what gets replaced.
    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    ['<app-badge @', ''],
    ['<app-badge @cli', 'cli'],
    ['<app-badge .tone="@(t)" @', ''],
    ['<app-badge @my-press', 'my-press'],
    // A value never crosses a blank (decision 101 applied to the value), so the `@` after the
    // space does not belong to `@click=`: `@click` was left with no value at all — `FUD0056`
    // — and what is being typed here is the NAME of the next event.
    ['<app-badge @click= @on', 'on'],
  ])('reads the event being typed at %s as %s', (prefix, expected) => {
    const context = eventContextAt(prefix, prefix.length, regionOf(prefix, prefix.length));

    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // Markup text: `<p>3.14</p>` is a sentence, and so is an email address.
    ['<p>3.'],
    ['.tone'],
    ['<p>hello.wor'],
    // Somebody else's string, inside a quoted value.
    ['<app-badge title="a.'],
    ["<app-badge title='a.b"],
    // A dot that continues a word or another dot is neither.
    ['<app-badge x.'],
    ['<app-badge ..'],
  ])('offers no property at %s', (source) => {
    expect(propertyContextAt(source, source.length, regionOf(source, source.length))).toBeUndefined();
  });

  it.each([
    // Outside a tag an `@` is the Razor transition, and that is directiveContextAt's.
    ['<p>@'],
    ['@fore'],
    // Somebody else's string.
    ['<app-badge title="@'],
    // `@@` is the escape of decision 1, and a `@` after a word is text.
    ['<app-badge @@'],
    ['<app-badge a@'],
  ])('offers no event at %s', (source) => {
    expect(eventContextAt(source, source.length, regionOf(source, source.length))).toBeUndefined();
  });

  it('is the context again in the tag that follows a quoted one', () => {
    const source = '<div title="a.b"></div>\n<app-badge .to';

    expect(propertyContextAt(source, source.length, regionOf(source, source.length))?.text).toBe('to');
  });
});

/**
 * The four positions BUG-23 added, and the question they all answer: who is being asked.
 *
 * Every one of them is text read backwards from the caret rather than a lookup in the tree,
 * and that is not a shortcut. At the instant completion is asked, `@click=@` has no handler in
 * the tree at all — classification degraded it the moment the expression came out empty — so
 * the shape the author typed is the only thing left, and it is unambiguous.
 */
describe('memberContextAt (BUG-23 §2.2)', () => {
  it.each([
    ['<div>@data.'],
    ['<div>@post.author.'],
    ['<div>@data?.'],
    ['@data.'],
    ['<div id="@data.'],
    // An UNQUOTED value inside the tag: the region is `tag` rather than `attr-value`, because
    // the caret sits one character past the atom — the dangling dot is not part of its span.
    // The `=` behind the chain is what says the dot is a member and not a prop being opened.
    ['<app-badge .name=@data.'],
    ['<app-badge .name="@data.'],
  ])(
    'is the context at %s',
    (source) => {
      const context = memberContextAt(source, source.length, regionOf(source, source.length));

      // Nothing typed after the dot yet: the item replaces an empty stretch at the caret.
      expect(context).toEqual({ span: { start: source.length, end: source.length }, text: '' });
    },
  );

  it.each([
    // Inside an open tag the dot opens a PROP, and `propertyContextAt` owns it.
    ['<app-badge .'],
    ['<app-badge .tone.'],
    // No `@` behind the chain: a sentence, a version number, an address.
    ['<div>3.'],
    ['<div>hello.wor'],
    // `@@` is the escape of decision 1, and a `@` glued to a word is an email address.
    ['<div>@@data.'],
    ['<div>hola@data.'],
    // A name with no dot yet is not a member access.
    ['<div>@data'],
    // A `@` chain inside a tag with no `=` in front of it is an event NAME being written, and
    // the members of nothing: only the equals sign makes the dot a member access there.
    ['<app-badge @data.'],
  ])('says nothing at %s', (source) => {
    expect(memberContextAt(source, source.length, regionOf(source, source.length))).toBeUndefined();
  });
});

describe('handlerContextAt (BUG-23 §2.3)', () => {
  it.each([
    ['<app-badge @click=@', ''],
    ['<app-badge @click=@on', 'on'],
    ['<app-badge @click="@on', 'on'],
    ["<app-badge @click='@on", 'on'],
    // A chain is allowed, so the dot is part of the name rather than the end of it.
    ['<app-badge @click=@this.onPick', 'this.onPick'],
  ])('reads the handler being written at %s as %s', (source, expected) => {
    const context = handlerContextAt(source, source.length, regionOf(source, source.length));

    expect(context?.text).toBe(expected);
    expect(source.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // A prop is not an event: what may go there is any expression, not a listener.
    ['<app-badge .name=@on'],
    // No `@` typed yet: nothing has been opened.
    ['<app-badge @click=on'],
    // Away from its `=`, and a value never crosses a blank: `@click` has no value here at all
    // — `FUD0056` — and the `@on` behind the space is the next event's NAME being typed.
    ['<app-badge @click= @on'],
    // The same characters inside a `<style>`, where the `@` opens an at-rule and the region
    // is the guard: what belongs there is CSS, and the CSS service owns it.
    ['<style>\n  .a { content: "@click=@on'],
  ])('says nothing at %s', (source) => {
    expect(handlerContextAt(source, source.length, regionOf(source, source.length))).toBeUndefined();
  });
});

describe('expressionValueContextAt (BUG-23 §2.3)', () => {
  it.each([
    ['<app-badge .name=@', '@'],
    ['<app-badge .name=@ti', '@ti'],
    ['<app-badge id="@ti', '@ti'],
    ['<app-badge class:red=@on', '@on'],
    ['<app-badge bus:cart=@it', '@it'],
  ])('reads the value being written at %s as %s', (source, expected) => {
    const context = expressionValueContextAt(source, source.length, regionOf(source, source.length));

    // The `@` is INSIDE the span: the `@()` snippet offered here replaces it, and completing
    // over the name alone would leave `@@(…)`, the escape of decision 1.
    expect(context?.text).toBe(expected);
    expect(source.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // A trailing dot is a member access, and `memberContextAt` owns it.
    ['<app-badge .name=@data.'],
    // No `@`: nothing has been opened.
    ['<app-badge .name=x'],
    // Markup, not a value.
    ['<div>@ti'],
  ])('says nothing at %s', (source) => {
    expect(
      expressionValueContextAt(source, source.length, regionOf(source, source.length)),
    ).toBeUndefined();
  });
});

describe('bareBindingValueContextAt (BUG-23 §2.3)', () => {
  it.each([
    ['<app-badge .name=r', 'r'],
    ['<app-badge @click=j', 'j'],
    ['<app-badge .name="r', 'r'],
    ['<app-badge .name=', ''],
  ])('reads the value with no `@` at %s as %s', (source, expected) => {
    const context = bareBindingValueContextAt(source, source.length, regionOf(source, source.length));

    expect(context?.text).toBe(expected);
  });

  it.each([
    // Once the `@` is there the position belongs to the two contexts above, whose lists are
    // real: this one answers nothing at all.
    ['<app-badge .name=@r'],
    ['<app-badge @click=@j'],
    // HTML's own attributes are not closed: the HTML and CSS services have answers there.
    ['<app-badge class=b'],
    ['<div slot=p'],
    // Markup again.
    ['<div>.name=r'],
  ])('says nothing at %s', (source) => {
    expect(
      bareBindingValueContextAt(source, source.length, regionOf(source, source.length)),
    ).toBeUndefined();
  });
});

describe('ownedByProjection (BUG-23 §4.1)', () => {
  it.each([
    ['<app-badge .'],
    ['<app-badge @'],
    ['<div>@data.'],
    ['<app-badge @click=@on'],
    ['<app-badge .name=@ti'],
    ['<app-badge .name=r'],
    // A gap of a COMPONENT tag, empty or half-written. `$gap` answers it whole — the props,
    // the classes of this file and HTML's entire vocabulary — so a second voice there is not
    // one more answer but the same one twice.
    ['<app-badge '],
    ['<app-badge cla'],
  ])('claims %s for the projection', (source) => {
    expect(ownedByProjection(source, source.length, regionOf(source, source.length))).toBe(true);
  });

  it.each([
    // Where the HTML, CSS and fudic services have real answers: a tag, an attribute name, a
    // class, a directive in markup, plain text.
    ['<app-'],
    // The same gap in a NATIVE tag, which has no `$gap`: HTML's list is the right one there,
    // and the `class:` bindings are added BESIDE it by the additional plugin.
    ['<div cla'],
    ['<div class="b'],
    ['<div>@fore'],
    ['<div>hola'],
  ])('leaves %s to the services of the root', (source) => {
    expect(ownedByProjection(source, source.length, regionOf(source, source.length))).toBe(false);
  });
});

describe('wordContextAt (SDD-28 §5.3)', () => {
  it.each([
    ['app-button', 'app-button'],
    ['<div>\n  app-b', 'app-b'],
    ['<div></div>\ntext app', 'app'],
  ])('reads %s as the word %s', (prefix, expected) => {
    const context = wordContextAt(prefix, prefix.length, regionOf(prefix, prefix.length));

    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // A word a `<` opens belongs to tagContextAt, not here.
    ['<app-b'],
    // Inside an open tag a word is an attribute name, and those are the projection's.
    ['<app-button ton'],
    ['<div class="a" hidd'],
    // Not a word at all: whitespace, a delimiter, and something that starts with a digit.
    ['<div> '],
    ['<div>'],
    ['123'],
  ])('says nothing at %s', (source) => {
    expect(wordContextAt(source, source.length, regionOf(source, source.length))).toBeUndefined();
  });

  it('is a word again once the tag is closed', () => {
    const source = '<div class="a">app';

    expect(wordContextAt(source, source.length, regionOf(source, source.length))?.text).toBe('app');
  });
});

describe('directiveContextAt (SDD-28 §5.4)', () => {
  it.each([
    ['@', '@'],
    ['@i', '@i'],
    ['<div>\n  @fore', '@fore'],
  ])('reads %s as %s, the `@` included', (prefix, expected) => {
    const context = directiveContextAt(prefix, prefix.length, regionOf(prefix, prefix.length));

    expect(context?.text).toBe(expected);
    expect(prefix.slice(context?.span.start, context?.span.end)).toBe(expected);
  });

  it.each([
    // `@@` is the escape of decision 1, and a `@` after a word is text, not a directive.
    ['@@'],
    ['@@i'],
    ['hola@ejemplo'],
    ['x@'],
    ['plain'],
    // Inside an open tag an `@` is an event, never a directive (BUG-16 §4.4).
    ['<app-badge @'],
    ['<app-badge @cli'],
    ['<app-badge .tone="@(t)" @i'],
  ])('says nothing at %s', (source) => {
    expect(directiveContextAt(source, source.length, regionOf(source, source.length))).toBeUndefined();
  });

  it('is a directive again once the tag is closed', () => {
    const source = '<app-badge @click="@h"></app-badge>\n@fore';

    expect(directiveContextAt(source, source.length, regionOf(source, source.length))?.text).toBe('@fore');
  });
});

describe('isEmptyDocument', () => {
  it.each([
    [''],
    ['   '],
    ['\n\n  \t\n'],
    // Nothing but the word being typed: still a file nobody has written yet, and the only
    // state in which a skeleton is ever asked for.
    ['x'],
    ['rou'],
    ['  app-b\n'],
  ])('is true for %j', (source) => {
    expect(isEmptyDocument(source)).toBe(true);
  });

  it.each([['<div></div>'], ['@* a comment *@'], ['two words'], ['@code {}']])(
    'is false for %j',
    (source) => {
      expect(isEmptyDocument(source)).toBe(false);
    },
  );
});

/**
 * The gap of a start tag, and which of the two tags it belongs to.
 *
 * A component's gap is the PROJECTION's — `$gap` answers it with the props and HTML's
 * vocabulary at once — and a native tag's is HTML's, with the `class:` bindings added beside
 * it. One function each, so the caller never has to ask what kind of tag it is looking at.
 */
describe('attributeGapContextAt and nativeGapContextAt', () => {
  const gapAt = (source: string) =>
    attributeGapContextAt(source, source.length, regionOf(source, source.length));
  const nativeAt = (source: string) =>
    nativeGapContextAt(source, source.length, regionOf(source, source.length));

  it.each([
    ['<app-badge ', ''],
    ['<app-badge na', 'na'],
    ['<app-badge id="x" ', ''],
    ['<app-badge\n  .tone="@(t)"\n  ', ''],
  ])('reads the gap of a component at %j as %j', (source, expected) => {
    expect(gapAt(source)?.text).toBe(expected);
    expect(source.slice(gapAt(source)?.span.start, gapAt(source)?.span.end)).toBe(expected);
    // A component's gap is never the native one: the two are exclusive by the hyphen.
    expect(nativeAt(source)).toBeUndefined();
  });

  it.each([
    ['<div ', ''],
    ['<div cla', 'cla'],
  ])('reads the gap of a native tag at %j as %j', (source, expected) => {
    expect(nativeAt(source)?.text).toBe(expected);
    expect(gapAt(source)).toBeUndefined();
  });

  it.each([
    // The tag's own name is being typed, and `tagContextAt` owns that.
    ['<app-badg'],
    ['<app-badge'],
    // Inside an attribute, which belongs to that attribute: the region carries it.
    ['<app-badge .ton'],
    ['<app-badge @cli'],
    ['<app-badge class:re'],
    // Not a tag at all.
    ['<div>hola'],
    ['<app-badge title="a'],
  ])('says nothing at %j', (source) => {
    expect(gapAt(source)).toBeUndefined();
    expect(nativeAt(source)).toBeUndefined();
  });

  it('says nothing inside a CLOSE tag, which takes no attributes', () => {
    // `</app-badge |>` is not a gap: the region of a close tag is a `tag` like the opening
    // one's, so only the `/` behind the `<` separates them.
    const source = '<app-badge></app-badge >';
    const at = source.indexOf('</app-badge') + '</app-badge '.length;

    expect(attributeGapContextAt(source, at, regionOf(source, at))).toBeUndefined();
  });
});

/**
 * The value of a `class` and the value of a `slot`: two closed lists this server can name.
 *
 * Both exist for the SPAN rather than for the names. A class value is a space-separated list,
 * so only the word under the caret is replaced; a slot name is projected with quotes the source
 * does not have, so TypeScript's own range comes back two characters adrift.
 */
describe('classValueContextAt and slotValueContextAt', () => {
  const classAt = (source: string) =>
    classValueContextAt(source, source.length, regionOf(source, source.length));
  const slotAt = (source: string) =>
    slotValueContextAt(source, source.length, regionOf(source, source.length));

  it.each([
    ['<div class="', ''],
    ['<div class="re', 're'],
    // A list: `red` has to survive whatever is accepted for the second name.
    ['<div class="red ye', 'ye'],
  ])('reads the class being typed at %j as %j', (source, expected) => {
    expect(classAt(source)?.text).toBe(expected);
    expect(source.slice(classAt(source)?.span.start, classAt(source)?.span.end)).toBe(expected);
  });

  it.each([
    ['<div slot="', ''],
    ['<div slot="PE', 'PE'],
  ])('reads the slot being typed at %j as %j', (source, expected) => {
    expect(slotAt(source)?.text).toBe(expected);
  });

  it.each([
    // Somebody else's attribute.
    ['<div title="re'],
    ['<div class:red="re'],
    // Not inside a value at all.
    ['<div cla'],
    ['<div>red'],
    // A Razor atom inside the value is region `expression`, and TypeScript's.
    ['<div class="@(x'],
  ])('offers no class at %j', (source) => {
    expect(classAt(source)).toBeUndefined();
  });

  it('offers nothing behind a dot, which is a value the author has already broken', () => {
    // Out of habit from `.prop`, most likely. The dot is not part of the run an item replaces,
    // so accepting `PEPITO` would write `.PEPITO`, a name no component declares.
    const source = '<div slot=".';

    expect(slotAt(source)).toBeUndefined();
    expect(classValueContextAt('<div class=".', 13, regionOf('<div class=".', 13))).toBeUndefined();
  });

  it('is nobody’s `class` when the attribute is named with an expression', () => {
    // `bus:(EVENTS.cart)` writes its name as an expression, so the region carries no name to
    // compare — and a value with no name is not the one attribute this context is about.
    const source = '<div bus:(EVENTS.cart)="re';

    expect(classAt(source)).toBeUndefined();
  });
});

/**
 * Inside a value where an interpolation could be opened, with no `@` yet.
 *
 * Any attribute takes a binding — `role="@data.title"`, `href="/name/@data.slug"` — and nothing
 * said so: the names appeared only once the `@` was typed, so the author had to know the answer
 * to be able to ask the question.
 */
describe('attributeValueBindingAt', () => {
  const bindingAt = (source: string) =>
    attributeValueBindingAt(source, source.length, regionOf(source, source.length));

  it.each([
    ['<div role="', ''],
    ['<div role="ti', 'ti'],
    ['<div title="/a/', ''],
  ])('reads the value being opened at %j as %j', (source, expected) => {
    expect(bindingAt(source)?.text).toBe(expected);
  });

  it.each([
    // `class` and `slot` have closed lists of their own here, and a second vocabulary beside
    // them is noise over a position that already answers well.
    ['<div class="re'],
    ['<div slot="PE'],
    // A `@` behind the caret means the expression is open and the projection owns the answer.
    ['<div role="@'],
    ['<div role="@ti'],
    ['<div role="@data.'],
    // Not inside a value.
    ['<div rol'],
    ['<div>hola'],
  ])('says nothing at %j', (source) => {
    expect(bindingAt(source)).toBeUndefined();
  });

  it('answers inside a value whose attribute is NAMED with an expression', () => {
    // `bus:(EVENTS.cart)` writes its name as an expression, and the region still carries the
    // attribute — so the value is a value like any other, and a `@` may be opened in it.
    const source = '<div bus:(EVENTS.cart)="';

    expect(bindingAt(source)?.text).toBe('');
  });
});

/**
 * A value the author opened with a `.`, which is an error and not a question.
 *
 * Right of a `=` goes an expression, and an expression is opened with a `@` (decision 1). A `.`
 * there is `FUD0056` and the compiler says so already; a list where the file is red teaches the
 * opposite of what the error says.
 */
describe('brokenValueContextAt', () => {
  const brokenAt = (source: string) =>
    brokenValueContextAt(source, source.length, regionOf(source, source.length));

  it.each([
    ['<app-badge .name=.'],
    ['<app-badge .name=.to'],
    ['<div @click=.'],
    ['<app-badge .name= .'],
  ])('claims %j, whose answer is nothing', (source) => {
    expect(brokenAt(source)).toBe(true);
  });

  it.each([
    // Quoted, and then it is a literal string and perfectly legal.
    ['<div title=".foo'],
    // The `@` that opens an expression properly.
    ['<app-badge .name=@'],
    // A prop being reached, which is `propertyContextAt`'s.
    ['<app-badge .'],
    // Markup, where a dot is a sentence.
    ['<div>3.'],
  ])('leaves %j alone', (source) => {
    expect(brokenAt(source)).toBe(false);
  });
});
