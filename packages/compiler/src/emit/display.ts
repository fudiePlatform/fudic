/**
 * Which BOX holds a piece of text (BUG-21 §3.2, §4.3).
 *
 * `space.ts` answers whether a run of whitespace collapses; this answers where the space
 * it collapses to would land. They are different questions and the second one is the one
 * that decides whether the space renders at all: between two block boxes there is no line
 * for it to fall on, at the edge of a block container it is trimmed, and inside a flex or
 * grid container a whitespace-only child generates no box whatsoever.
 *
 * **Why the compiler gets to ask it and a minifier does not.** An external tool decides
 * inline vs block from a fixed list of tags, and a custom element is in no list — on a page
 * that is almost entirely custom elements that heuristic fails in the NORMAL case, which is
 * why BUG-07 §4.5 refused to delete anything. But `<app-badge>` is not an unknown tag here:
 * it is a component of the graph, its file is resolved and its `<style>` says
 * `:host { display: inline-block }`. The one fact nobody outside can have is the first one
 * this module reads.
 *
 * **Why a module and not a method**, and it is the reason of `marker.ts:18-22`: the server
 * branch and the client branch have to decide IDENTICALLY. A node one of them drops and the
 * other builds is worse than a node neither drops — the two trees stop being the same tree
 * and `h()` adopts a tree it does not recognise.
 *
 * The CSS is read by regex over the LITERAL runs, exactly as `spaceModeOf` reads it: SDD-09
 * §7 leaves the rule tree out of v1 and `StyleNode` is deliberately flat. That is a real
 * limitation and it is what §4.3.c pays for — anything that cannot be read is `unknown`,
 * and `unknown` conserves.
 */

import type { StyleNode } from '../css/index.js';
import type { ElementNode } from '../html/index.js';
import { literalCss, nestedSpaceMode, type SpaceMode } from './space.js';

/**
 * What the emit can affirm about a box. `unknown` is the answer by default and the answer
 * to everything doubtful (§4.1).
 *
 * The set is wider than the four names of §3.2 because two of the three proofs of §4.2 need
 * distinctions those four collapse. `flex` (which grid joins) is not `block`: its
 * whitespace-only children generate NO box, which is a stronger fact than a trimmed edge.
 * And `inline-block` is not `inline`: inside it is a block container whose edges trim —
 * `:host { display: inline-block }` is what `app-badge` and `app-button` declare — while
 * outside it is inline-level, so the whitespace BESIDE it renders. Folding either pair
 * would have to lie in one of the two directions, and the safe lie conserves every node the
 * BUG is about.
 */
export type Display = 'block' | 'flex' | 'inline-block' | 'inline' | 'contents' | 'unknown';

/**
 * Whether a box is BLOCK-LEVEL in its parent's flow — the question §4.2.c asks of the two
 * neighbours of a run. A block-level box breaks the line on both sides, so whitespace
 * between two of them has no line to render on.
 */
export const isBlockLevel = (display: Display): boolean => display === 'block' || display === 'flex';

/**
 * Whether a box lays its children out as a BLOCK CONTAINER — the question §4.2.b asks of the
 * container. Collapsible whitespace at the start or the end of one is removed, because the
 * edge of a block container is always the edge of a line.
 */
export const isBlockContainer = (display: Display): boolean =>
  display === 'block' || display === 'inline-block';

/** The CSS `display` values this module can act on. Everything else is `unknown`. */
const KEYWORDS: Readonly<Record<string, Display>> = {
  block: 'block',
  'flow-root': 'block',
  'list-item': 'block',
  table: 'block',
  flex: 'flex',
  grid: 'flex',
  'inline-block': 'inline-block',
  // Inline-level outside, and inside a formatting context whose edges this module does not
  // claim to know: `inline` is the conservative answer for both halves of the question.
  'inline-flex': 'inline',
  'inline-grid': 'inline',
  'inline-table': 'inline',
  inline: 'inline',
  contents: 'contents',
};

const keyword = (value: string): Display => KEYWORDS[value.toLowerCase()] ?? 'unknown';

/**
 * A `:host` rule and its body. `:host(...)` is deliberately NOT matched: that rule applies
 * only when the host carries the selector's condition, and a conditional box is not a fact
 * — it falls through to `unknown`, and to `hasForeignDisplay`, which is the safe side.
 */
const HOST_RULE = /:host\s*\{([^{}]*)\}/giu;

/** A `display` declaration whose value is LITERAL: an interpolated one matches nothing. */
const DISPLAY_DECL = /\bdisplay\s*:\s*([a-z-]+)/iu;

/**
 * The `display` a component declares for its own `:host`, or `unknown` (§4.3.a).
 *
 * The LAST declaration wins, which is what the cascade does with two rules of equal
 * specificity. A component that declares none is `inline` by default — the default of every
 * custom element — and `unknown` is what says so here: nothing about its edges is provable,
 * so its whitespace stays.
 */
export function hostDisplay(style: StyleNode | null): Display {
  if (style === null) return 'unknown';
  let display: Display = 'unknown';
  for (const rule of literalCss(style).matchAll(HOST_RULE)) {
    const decl = DISPLAY_DECL.exec(rule[1]!);
    if (decl !== null) display = keyword(decl[1]!);
  }
  return display;
}

/**
 * Whether the stylesheet declares a `display` anywhere OUTSIDE `:host` — which poisons the
 * tag table for the whole file (§4.3.c).
 *
 * Without a rule tree there is no telling which element `.card { display: flex }` selects,
 * and a `<div>` the emit believes is a block container may be a flex one. Coarse, and the
 * safe direction: every known tag of that file drops to `unknown`, and `unknown` conserves.
 */
export function hasForeignDisplay(style: StyleNode | null): boolean {
  if (style === null) return false;
  return DISPLAY_DECL.test(literalCss(style).replace(HOST_RULE, ' '));
}

/**
 * The default `display` of a known HTML tag (§4.3.c).
 *
 * A LIST, and the objection BUG-07 §4.5 raised against lists still stands whole: a custom
 * element is in none of them. What answers it is not a longer list but the entry above —
 * `unknown` for everything not written here, and the graph for a component's own tag.
 */
const TAGS: Readonly<Record<string, Display>> = {
  html: 'block',
  body: 'block',
  div: 'block',
  p: 'block',
  h1: 'block',
  h2: 'block',
  h3: 'block',
  h4: 'block',
  h5: 'block',
  h6: 'block',
  ul: 'block',
  ol: 'block',
  li: 'block',
  dl: 'block',
  dt: 'block',
  dd: 'block',
  header: 'block',
  footer: 'block',
  main: 'block',
  nav: 'block',
  section: 'block',
  article: 'block',
  aside: 'block',
  figure: 'block',
  figcaption: 'block',
  blockquote: 'block',
  address: 'block',
  form: 'block',
  fieldset: 'block',
  hr: 'block',
  pre: 'block',
  details: 'block',
  summary: 'block',
  dialog: 'block',
  span: 'inline',
  a: 'inline',
  b: 'inline',
  i: 'inline',
  em: 'inline',
  strong: 'inline',
  small: 'inline',
  s: 'inline',
  u: 'inline',
  code: 'inline',
  kbd: 'inline',
  samp: 'inline',
  sub: 'inline',
  sup: 'inline',
  mark: 'inline',
  abbr: 'inline',
  cite: 'inline',
  q: 'inline',
  time: 'inline',
  var: 'inline',
  label: 'inline',
  img: 'inline',
  br: 'inline',
  button: 'inline-block',
  input: 'inline-block',
  select: 'inline-block',
  textarea: 'inline-block',
  meter: 'inline-block',
  progress: 'inline-block',
  // Its box is the assigned content's, so nothing about it is this module's to affirm.
  slot: 'contents',
};

/** The default `display` of `tag`, or `unknown` when it is not a tag this table knows. */
export function tagDisplay(tag: string): Display {
  return TAGS[tag.toLowerCase()] ?? 'unknown';
}

/**
 * What a FILE knows about the box of a tag: the graph for a component, the table for the
 * rest — and nothing at all once a foreign `display` has poisoned it.
 *
 * It is one object and not three arguments because it travels down the whole walk and both
 * branches carry the same one: a difference between them is a difference between two trees.
 */
export interface Boxes {
  /**
   * The `:host` display of the component of that tag, `unknown` when the tag is not one of
   * the graph or its component declares none (§3.3, §4.3.b). It is the source no tool
   * outside this compiler can have.
   */
  of(tag: string): Display;
  /** Whether a `display` outside `:host` has poisoned the tag table for this file (§4.3.c). */
  readonly poisoned: boolean;
}

/**
 * What an emitter with no stylesheet in hand knows: nothing. Every question answers
 * `unknown`, so every run survives and the output is what it was before this rule existed.
 * It is the default on purpose — a caller that forgets to pass the graph loses the
 * optimisation, never a node.
 */
export const NO_BOXES: Boxes = { of: () => 'unknown', poisoned: true };

/** The display of a tag as this file can answer it: the graph first, then the table (§4.3). */
export function displayOfTag(tag: string, boxes: Boxes): Display {
  const own = boxes.of(tag);
  if (own !== 'unknown') return own;
  return boxes.poisoned ? 'unknown' : tagDisplay(tag);
}

/**
 * Everything the decision of §4.2 needs about the place a child list sits in — the context
 * `emitItems` takes instead of a bare `SpaceMode`.
 *
 * A mode alone could not answer it: the question stopped being *«does this collapse?»* and
 * became *«which box does it fall in?»*, and that is a fact about the parent and the
 * neighbours, not about the run.
 */
export interface RunContext {
  /** Whether the literal pieces collapse — decided first, and unchanged (BUG-07 §4.4). */
  readonly space: SpaceMode;
  /** The box these children live in: the shadow root's `:host`, or their parent element. */
  readonly container: Display;
  /**
   * Whether these children are the LIGHT DOM of a component host, or the fallback of a
   * `<slot>`. Both are content that may be ASSIGNED, and a whitespace node counts as
   * assigned content: dropping one makes a filled `<slot>` show its fallback (§4.4).
   */
  readonly light: boolean;
  /**
   * Whether this list begins / ends at the container's content edge. It is not always the
   * same as being the first item: the body of a `@if` is the start of the container only
   * when nothing of the level renders before it (§4.2.b).
   */
  readonly atStart: boolean;
  readonly atEnd: boolean;
  /** What the file knows about the display of a tag. */
  readonly boxes: Boxes;
}

/** The context a walk starts in: the whole of its container, with its edges. */
export function rootContext(space: SpaceMode, container: Display, boxes: Boxes): RunContext {
  return { space, container, light: false, atStart: true, atEnd: true, boxes };
}

/**
 * The context an element's own children are emitted in — the ONE place it is derived, so
 * the two branches cannot derive it differently (§4.5).
 *
 * A component host and a `<slot>` open a light-DOM context: what hangs there may be
 * projected somewhere this compilation cannot see, so its box is nobody's to affirm and its
 * whitespace is nobody's to drop.
 */
export function childrenContext(at: RunContext, el: ElementNode, isComponent: boolean): RunContext {
  const light = isComponent || el.name.toLowerCase() === 'slot';
  return {
    space: nestedSpaceMode(at.space, el),
    container: light ? 'unknown' : displayOfTag(el.name, at.boxes),
    light,
    atStart: true,
    atEnd: true,
    boxes: at.boxes,
  };
}

/**
 * The context the BODY of a construct is emitted in: the level's own, narrowed to where the
 * construct sits in it. A block is not a level of the DOM — its nodes are its parent's
 * children — so it inherits the container and only its edges move.
 */
export function bodyContext(at: RunContext, first: boolean, last: boolean): RunContext {
  return { ...at, atStart: at.atStart && first, atEnd: at.atEnd && last };
}
