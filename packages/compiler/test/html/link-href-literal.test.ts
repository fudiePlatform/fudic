/**
 * The `href` of a component or layout link is read VERBATIM (SDD-43 §4.3).
 *
 * `@` is the transition character of the grammar and `@acme/ui` is what npm calls a scoped
 * package, so the two met inside the one attribute where a literal is the only thing that
 * could ever have been meant: an href names a file the compiler opens, never a value it
 * computes. Before this, `href="@acme/ui/card.fud"` parsed as the expression `@acme` plus
 * the text `/ui/card.fud`, and every reader of the href kept only the text.
 *
 * The rule is narrow on purpose. It is these two `rel`s and no others — a
 * `<link rel="preload" href="@data.hero">` is an expression because its value really is
 * computed, and that is measured here too.
 */

import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { linkHref } from '../../src/emit/index.js';
import type { Attribute, ElementNode, HtmlContent } from '../../src/html/index.js';

/** Every element of a parsed source, depth first. */
function elements(nodes: readonly HtmlContent[]): ElementNode[] {
  const out: ElementNode[] = [];
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    out.push(node);
    out.push(...elements(node.children));
  }
  return out;
}

/** The `href` attribute of the first `<link>`, and the diagnostics the parse produced. */
function linkHrefAttr(source: string): {
  readonly attribute: Attribute | undefined;
  readonly codes: readonly string[];
} {
  const parsed = parseDocument(source);
  const link = elements(parsed.value.children).find(
    (element) => element.name.toLowerCase() === 'link',
  );
  return {
    attribute: link?.attributes.find(
      (candidate) => typeof candidate.name === 'string' && candidate.name.toLowerCase() === 'href',
    ),
    codes: parsed.diagnostics.map((diagnostic) => diagnostic.code),
  };
}

/** The value of an href, as its parts spell it. */
const spelling = (attribute: Attribute | undefined): string =>
  (attribute?.value ?? [])
    .map((part) => (part.type === 'attribute-text' ? part.value : `«expr»`))
    .join('');

describe('a component link', () => {
  it('reads a scoped package specifier as one run of text', () => {
    const { attribute } = linkHrefAttr('<link rel="component" href="@acme/ui/card.fud">');
    expect(attribute?.value).toHaveLength(1);
    expect(spelling(attribute)).toBe('@acme/ui/card.fud');
  });

  it('spans exactly the value, quotes excluded', () => {
    const source = '<link rel="component" href="@acme/ui/card.fud">';
    const { attribute } = linkHrefAttr(source);
    const part = attribute?.value[0];
    expect(source.slice(part?.span.start ?? 0, part?.span.end ?? 0)).toBe('@acme/ui/card.fud');
  });

  it('does not un-escape `@@`, because nothing in an href is escaped', () => {
    const { attribute } = linkHrefAttr('<link rel="component" href="@@acme/ui/card.fud">');
    expect(spelling(attribute)).toBe('@@acme/ui/card.fud');
  });

  it('leaves an href with no `@` exactly as it was', () => {
    const { attribute, codes } = linkHrefAttr('<link rel="component" href="../ui/card.fud">');
    expect(attribute?.value).toHaveLength(1);
    expect(spelling(attribute)).toBe('../ui/card.fud');
    expect(codes).toEqual([]);
  });

  it('says nothing about the `@` it no longer reads as a construct', () => {
    // The value was parsed as a construct on the way in, and whatever that had to say is
    // not a diagnostic about a path. Reported here because a stray complaint over a valid
    // href is exactly the kind of noise this rule exists to remove.
    const { codes } = linkHrefAttr('<link rel="component" href="@acme/ui/card.fud">');
    expect(codes).toEqual([]);
  });

  it('works when `rel` is written after `href`', () => {
    // `rel` decides and `rel` may come second, which is why the value is re-read after the
    // attributes are parsed rather than while they are.
    const { attribute } = linkHrefAttr('<link href="@acme/ui/card.fud" rel="component">');
    expect(spelling(attribute)).toBe('@acme/ui/card.fud');
  });

  it('is case-insensitive about the names, as HTML is', () => {
    const { attribute } = linkHrefAttr('<LINK REL="COMPONENT" HREF="@acme/ui/card.fud">');
    expect(spelling(attribute)).toBe('@acme/ui/card.fud');
  });

  it('steps over an attribute whose NAME is an expression', () => {
    // `bus:(EVENTO)` names itself with a Razor expression (decision 28.b), so looking for
    // `rel` and `href` has to survive a name that is not a string at all.
    const { attribute } = linkHrefAttr(
      '<link bus:(EVENTOS.ui) rel="component" href="@acme/ui/card.fud">',
    );
    expect(spelling(attribute)).toBe('@acme/ui/card.fud');
  });
});

describe('a layout link', () => {
  it('reads its href verbatim too', () => {
    const { attribute } = linkHrefAttr('<link rel="layout" href="@acme/ui/_layout.fud">');
    expect(spelling(attribute)).toBe('@acme/ui/_layout.fud');
  });
});

describe('every other link', () => {
  it('keeps an interpolated href an interpolation', () => {
    const { attribute } = linkHrefAttr('<link rel="preload" href="@data.hero">');
    expect(spelling(attribute)).toBe('«expr»');
  });

  it('keeps it when there is no `rel` to decide', () => {
    const { attribute } = linkHrefAttr('<link href="@data.hero">');
    expect(spelling(attribute)).toBe('«expr»');
  });

  it('has no static href to give, and `linkHref` says so', () => {
    // `linkHref` is exported and reads any `<link>`, so the degradation it has always had —
    // expression parts contribute nothing — is still reachable, and this is where.
    const parsed = parseDocument('<link rel="preload" href="@data.hero">');
    const link = elements(parsed.value.children).find((element) => element.name === 'link');
    expect(linkHref(link!)).toBe('');
  });

  it('keeps it when `rel` is itself interpolated', () => {
    // What kind of link it is cannot depend on something computed at render time, so an
    // interpolated `rel` decides nothing and the href is left as it was.
    const { attribute } = linkHrefAttr('<link rel="@kind" href="@data.hero">');
    expect(spelling(attribute)).toBe('«expr»');
  });
});

describe('an ordinary attribute value', () => {
  it('still reports a construct that does not close', () => {
    // The contrast that gives the rule its edge. Everywhere else in a tag an `@` opens a
    // construct and a broken one is a diagnostic; in the href of these two links there is
    // no construct to break, so there is nothing to report.
    const { codes } = linkHrefAttr('<link rel="component" .titulo="@raw(" href="./card.fud">');
    expect(codes.length).toBeGreaterThan(0);
  });
});

describe('a component link with nothing to read', () => {
  it('leaves an empty href empty', () => {
    const { attribute } = linkHrefAttr('<link rel="component" href="">');
    expect(attribute?.value).toEqual([]);
  });

  it('leaves an absent href absent', () => {
    const { attribute } = linkHrefAttr('<link rel="component">');
    expect(attribute).toBeUndefined();
  });
});
