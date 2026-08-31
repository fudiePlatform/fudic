/**
 * SDD-36 §3.2 — the card a component shows on hover.
 *
 * No TypeScript program is built anywhere in this file, and that is the measurement: the card
 * has to appear over a component nobody has opened, in a project whose types have not loaded,
 * and in the second before a cold editor is ready. Everything it holds comes from the parse.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { cardMarkdown, tagCardAt } from '../../src/services/tag-card.js';
import { LAYOUT, memoryFs } from '../_support.js';

/** A component that declares props, slots, an event and a doc comment. */
const BUTTON = `@code {
  /**
   * Un botón con tono.
   * Segunda línea.
   */
  const { label, tone = 'neutral' } = props<{ label: string; tone?: string }>();

  @client {
    import { emit } from "@fudic/dom";

    function pick() {
      emit('picked', 1);
      emit('picked', 2);
    }
  }
}

<app-button>
  <template shadowrootmode="open">
    <span>@label</span>
    <slot name="icon"></slot>
    <slot></slot>
  </template>
</app-button>
`;

/** A component that declares nothing at all: no `@code`, no named slot, no event. */
const BARE = `<app-bare>
  <template shadowrootmode="open"><span>x</span></template>
</app-bare>
`;

/**
 * The awkward shapes, all in one component.
 *
 * An empty doc comment; an `emit` whose name is a variable, which no static read can name; a
 * `<slot>` with an attribute that is not `name`; and a `<slot name>` whose value is
 * interpolated, which is not a name any consumer can write into a `slot=`.
 */
const ODD = `@code {
  /** */
  const { a } = props<{ a?: string }>();

  @client {
    import { emit } from "@fudic/dom";

    const which = 'x';
    function go() { emit(which); }
  }
}

<app-odd>
  <template shadowrootmode="open">
    <slot id="one"></slot>
    <slot name="@(which)"></slot>
    <slot name="@(which)@(which)"></slot>
    <slot name="real"></slot>
  </template>
</app-odd>
`;

const PAGE = '/p/blog/[slug].fud';

/**
 * The index and the cached page, with `markup` in the body of the page.
 *
 * The layout link is what makes the file a ROUTE, and it is not decoration: without it the
 * parser reads a file whose markup is one custom element as the DECLARATION of that element,
 * so the page would index itself as the very component the test is asking about.
 */
function setup(markup: string) {
  const source = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-button.fud">\n${markup}\n`;
  const files: Record<string, string> = {
    '/p/components/app-button.fud': BUTTON,
    '/p/components/app-bare.fud': BARE,
    '/p/components/app-odd.fud': ODD,
    '/p/layouts/_layout.fud': LAYOUT,
    [PAGE]: source,
  };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');

  return { index, cached: new DocumentCache(index).get(PAGE, 1, source), source };
}

/** The card at the first character of the tag NAME in `at`. */
function cardAt(markup: string, at: string) {
  const { index, cached, source } = setup(markup);
  // Past the `<`, and past the `/` of a closing tag: the name is what the card answers over.
  return tagCardAt(cached, index, source.indexOf(at) + (at.startsWith('</') ? 2 : 1));
}

describe('tagCardAt', () => {
  it('reads the whole contract of a component from the parse', () => {
    const card = cardAt('<app-button></app-button>', '<app-button');

    expect(card?.tag).toBe('app-button');
    expect(card?.file).toBe('/p/components/app-button.fud');
    expect(card?.contract.props).toEqual([
      { name: 'label', required: true },
      { name: 'tone', required: false },
    ]);
    // The default slot is not a name a consumer can write into a `slot=` (decision 44).
    expect(card?.contract.slots).toEqual(['icon']);
    // Emitted twice from the same component, offered once: a component emits an event, not a
    // list of the places it emits it from.
    expect(card?.contract.events).toEqual(['picked']);
  });

  it('carries the doc the author wrote, with the stars taken off', () => {
    expect(cardAt('<app-button></app-button>', '<app-button')?.contract.doc).toBe(
      'Un botón con tono.\nSegunda línea.',
    );
  });

  it('answers over the closing tag too, which is the same component', () => {
    expect(cardAt('<app-button></app-button>', '</app-button')?.tag).toBe('app-button');
  });

  it('gives nothing on the `/` of a closing tag, which is not part of the name', () => {
    const { index, cached, source } = setup('<app-button></app-button>');

    expect(tagCardAt(cached, index, source.indexOf('</app-button') + 1)).toBeUndefined();
  });

  it('gives an empty contract for a component that declares nothing', () => {
    const card = cardAt('<app-bare></app-bare>', '<app-bare');

    expect(card?.contract).toEqual({ props: [], slots: [], events: [] });
  });

  it('names only what it can name, and skips what it cannot', () => {
    const card = cardAt('<app-odd></app-odd>', '<app-odd');

    // An `emit(which)` is a real emission with no name a static read can give it. Inventing
    // `which` for it would be worse than the gap.
    expect(card?.contract.events).toEqual([]);
    // A `<slot id>` names no slot; a `<slot name="@(…)">` names none a consumer can write; and
    // a value built out of two parts is not a literal name either.
    expect(card?.contract.slots).toEqual(['real']);
    // An empty `/** */` documents nothing, and an empty card section is worse than none.
    expect(card?.contract.doc).toBeUndefined();
  });

  it('gives nothing for a native element', () => {
    // A `<div>` has no fudic contract, and HTML already describes it.
    expect(cardAt('<div></div>', '<div')).toBeUndefined();
  });

  it('gives nothing for a custom element the workspace has never seen', () => {
    expect(cardAt('<app-ghost></app-ghost>', '<app-ghost')).toBeUndefined();
  });

  it('gives nothing where the offset is not on a tag name', () => {
    const { index, cached, source } = setup('<p>texto</p>');

    expect(tagCardAt(cached, index, source.indexOf('texto') + 1)).toBeUndefined();
  });
});

describe('cardMarkdown', () => {
  it('renders the tag, the doc and the three lists', () => {
    const card = cardAt('<app-button></app-button>', '<app-button');
    const text = cardMarkdown(card!, new Map());

    expect(text).toContain('**`<app-button>`** · fudic component');
    expect(text).toContain('Un botón con tono.');
    // The `?` is how TypeScript spells optional, so the card needs no legend for it.
    expect(text).toContain('- `.label`');
    expect(text).toContain('- `.tone?`');
    expect(text).toContain('- `icon`');
    expect(text).toContain('- `@picked`');
  });

  it('adds the type of a prop when the projection supplied one', () => {
    const card = cardAt('<app-button></app-button>', '<app-button');
    const text = cardMarkdown(card!, new Map([['label', 'string']]));

    expect(text).toContain('- `.label` — `string`');
    // The one with no type keeps its line: the card is complete without the second half.
    expect(text).toContain('- `.tone?`');
  });

  it('leaves out a section that would be empty', () => {
    // Three headings with nothing under them reads as broken; the absence already says the
    // component declares none of that kind.
    const text = cardMarkdown(cardAt('<app-bare></app-bare>', '<app-bare')!, new Map());

    expect(text).toBe('**`<app-bare>`** · fudic component');
  });
});
