/**
 * Which box holds a text node (BUG-21 §6.1–§6.3), unit by unit.
 *
 * Same rule as `space.test.ts`, and for the same reason: every node here comes from the REAL
 * parser. The whole argument of this BUG is that the facts are PARSED — the component's own
 * `<style>`, the child's `:host` through the graph — so a test that forged a `StyleNode`
 * would be testing a fixture of itself.
 */
import { describe, expect, it } from 'vitest';
import {
  childrenContext,
  displayOfTag,
  hasForeignDisplay,
  hostDisplay,
  isBlockContainer,
  isBlockLevel,
  rootContext,
  bodyContext,
  tagDisplay,
  NO_BOXES,
  type Boxes,
} from '../../src/emit/display.js';
import type { StyleNode } from '../../src/css/index.js';
import type { ElementNode } from '../../src/html/index.js';
import { parse } from './_support.js';

/** The `<style>` body of a one-component `.fud`, as the parser produces it. */
function styleOf(css: string): StyleNode {
  const doc = parse(`<head><style>${css}</style></head>\n<m-el><template shadowrootmode="open"></template></m-el>`);
  const head = (doc as { head?: ElementNode }).head!;
  const style = head.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  )!;
  return style.children[0] as StyleNode;
}

/** The first element of a component template, parsed. */
function elementOf(markup: string): ElementNode {
  const doc = parse(`<m-el><template shadowrootmode="open">${markup}</template></m-el>`);
  const template = (doc as { template?: ElementNode }).template!;
  return template.children.find((c): c is ElementNode => c.type === 'element')!;
}

describe('hostDisplay', () => {
  it('reads every display keyword the rule can act on', () => {
    expect(hostDisplay(styleOf(':host { display: block; }'))).toBe('block');
    expect(hostDisplay(styleOf(':host { display: inline-block; }'))).toBe('inline-block');
    // Flex and grid are the same fact for this rule: a whitespace-only child of either
    // generates NO box, which is stronger than a trimmed edge.
    expect(hostDisplay(styleOf(':host { display: flex; }'))).toBe('flex');
    expect(hostDisplay(styleOf(':host { display: grid; }'))).toBe('flex');
    expect(hostDisplay(styleOf(':host { display: contents; }'))).toBe('contents');
    expect(hostDisplay(styleOf(':host { display: inline; }'))).toBe('inline');
    expect(hostDisplay(styleOf(':host { display: flow-root; }'))).toBe('block');
    expect(hostDisplay(styleOf(':host { display: inline-flex; }'))).toBe('inline');
  });

  it('is unknown with no stylesheet, and with a stylesheet that declares no host display', () => {
    // A component that declares none is `inline` — the default of every custom element —
    // and nothing about its edges is provable, so its whitespace stays.
    expect(hostDisplay(null)).toBe('unknown');
    expect(hostDisplay(styleOf(':host { color: red; }'))).toBe('unknown');
    expect(hostDisplay(styleOf('.card { display: flex; }'))).toBe('unknown');
  });

  it('is unknown for a value Razor interpolates, like spaceModeOf', () => {
    // Same case as `color: @(theme.fg)`: the value is not a build-time fact, and what
    // cannot be read is `unknown` — which conserves.
    expect(hostDisplay(styleOf(':host { display: @(layout.mode); }'))).toBe('unknown');
    // The literal declaration still counts when it is the one that declares it.
    expect(hostDisplay(styleOf(':host { color: @(theme.fg); display: block; }'))).toBe('block');
  });

  it('is unknown for a keyword the rule cannot act on', () => {
    expect(hostDisplay(styleOf(':host { display: table-cell; }'))).toBe('unknown');
    expect(hostDisplay(styleOf(':host { display: none; }'))).toBe('unknown');
  });

  it('takes the LAST declaration, which is what the cascade does', () => {
    expect(hostDisplay(styleOf(':host { display: block; } :host { display: flex; }'))).toBe('flex');
  });

  it('does not read a conditional :host(...): a conditional box is not a fact', () => {
    expect(hostDisplay(styleOf(':host(.wide) { display: block; }'))).toBe('unknown');
  });
});

describe('hasForeignDisplay', () => {
  it('is true for a display declared outside :host — it poisons the tag table', () => {
    expect(hasForeignDisplay(styleOf('.card { display: flex; }'))).toBe(true);
    // Conditional host rules go to the safe side too: unread, so unreadable.
    expect(hasForeignDisplay(styleOf(':host(.wide) { display: block; }'))).toBe(true);
  });

  it('is false with only a :host display, and with no stylesheet at all', () => {
    expect(hasForeignDisplay(styleOf(':host { display: block; } .card { border: 0; }'))).toBe(false);
    expect(hasForeignDisplay(null)).toBe(false);
  });
});

describe('tagDisplay', () => {
  it('answers the block-level tags', () => {
    for (const tag of ['div', 'article', 'header', 'p', 'h2', 'ul', 'li', 'body']) {
      expect(tagDisplay(tag)).toBe('block');
    }
  });

  it('answers the inline ones, and the inline-block ones', () => {
    for (const tag of ['span', 'a', 'b']) expect(tagDisplay(tag)).toBe('inline');
    expect(tagDisplay('button')).toBe('inline-block');
    expect(tagDisplay('DIV')).toBe('block');
  });

  it('gives a <slot> the box of its assigned content: nothing this table can affirm', () => {
    expect(tagDisplay('slot')).toBe('contents');
  });

  it('is unknown for a custom element and for anything not in the table', () => {
    // The objection of BUG-07 §4.5, intact: a custom element is in no list. What answers it
    // is the graph, not a longer table.
    expect(tagDisplay('app-badge')).toBe('unknown');
    expect(tagDisplay('marquee')).toBe('unknown');
  });
});

describe('displayOfTag — the graph first, then the table', () => {
  const boxes: Boxes = { of: (tag) => (tag === 'app-badge' ? 'inline-block' : 'unknown'), poisoned: false };

  it('takes the component’s own :host when the graph knows the tag', () => {
    expect(displayOfTag('app-badge', boxes)).toBe('inline-block');
  });

  it('falls back to the tag table for everything else', () => {
    expect(displayOfTag('div', boxes)).toBe('block');
    expect(displayOfTag('app-card', boxes)).toBe('unknown');
  });

  it('answers unknown for every tag once the file is poisoned', () => {
    const poisoned: Boxes = { of: boxes.of, poisoned: true };
    expect(displayOfTag('div', poisoned)).toBe('unknown');
    // The graph is NOT poisoned by this file: the child's `:host` is the child's own fact.
    expect(displayOfTag('app-badge', poisoned)).toBe('inline-block');
  });

  it('knows nothing at all with NO_BOXES, which is what conserves every node', () => {
    expect(displayOfTag('div', NO_BOXES)).toBe('unknown');
  });
});

describe('the two box predicates', () => {
  it('block-level is what breaks the line on both sides', () => {
    expect(isBlockLevel('block')).toBe(true);
    expect(isBlockLevel('flex')).toBe(true);
    expect(isBlockLevel('inline-block')).toBe(false);
    expect(isBlockLevel('unknown')).toBe(false);
  });

  it('a block container is what trims its own edges', () => {
    expect(isBlockContainer('block')).toBe(true);
    // Inline-block is the pair the four-name set could not tell apart: inline-level
    // outside, a block container inside.
    expect(isBlockContainer('inline-block')).toBe(true);
    expect(isBlockContainer('flex')).toBe(false);
    expect(isBlockContainer('contents')).toBe(false);
  });
});

describe('the contexts a walk derives', () => {
  const boxes: Boxes = { of: (tag) => (tag === 'app-badge' ? 'block' : 'unknown'), poisoned: false };
  const root = rootContext('collapse', 'block', boxes);

  it('starts at both edges of its container', () => {
    expect(root).toMatchObject({ space: 'collapse', container: 'block', light: false, atStart: true, atEnd: true });
  });

  it('descends into an element with that element as the container', () => {
    const at = childrenContext(root, elementOf('<article></article>'), false);
    expect(at).toMatchObject({ container: 'block', light: false, atStart: true, atEnd: true });
    expect(childrenContext(root, elementOf('<span></span>'), false).container).toBe('inline');
  });

  it('opens a LIGHT DOM context at a host and at a <slot>, where no box is anyone’s to affirm', () => {
    // A whitespace node counts as assigned content: what hangs here may be projected
    // somewhere this compilation cannot see.
    expect(childrenContext(root, elementOf('<app-badge></app-badge>'), true)).toMatchObject({
      light: true,
      container: 'unknown',
    });
    expect(childrenContext(root, elementOf('<slot></slot>'), false).light).toBe(true);
  });

  it('carries the whitespace mode down, because white-space inherits', () => {
    expect(childrenContext(root, elementOf('<pre></pre>'), false).space).toBe('preserve');
    const inside = rootContext('preserve', 'block', boxes);
    expect(childrenContext(inside, elementOf('<div></div>'), false).space).toBe('preserve');
  });

  it('narrows only the EDGES for the body of a construct: a block is not a level of the DOM', () => {
    expect(bodyContext(root, true, false)).toMatchObject({ container: 'block', atStart: true, atEnd: false });
    expect(bodyContext(root, false, true)).toMatchObject({ atStart: false, atEnd: true });
    // And an edge that was already lost is not regained by sitting first in its level.
    const inner = bodyContext(root, false, false);
    expect(bodyContext(inner, true, true)).toMatchObject({ atStart: false, atEnd: false });
  });
});
