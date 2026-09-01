/**
 * What a tag gets wrong about the contract of the component it opens — the three facts the
 * light bulb hangs on.
 *
 * These are **not** diagnostics. In the editor the voice that reports them is TypeScript, over
 * the projection: `$props<$C0>` gives the missing prop and the misspelt one, `$intoSlot<$S0>`
 * gives the slot the parent does not declare. A second reporter would be the duplication BUG-23
 * spent a month removing.
 *
 * But TypeScript reports and does not repair. Measured against the real service, the projection
 * yields exactly zero quick fixes: the errors land on a synthetic object literal and on a call
 * nobody wrote, so «change the spelling» has nothing to offer — the only action it ever returned
 * was `refactor.move.newFile`, which is meaningless here and was what lit an empty bulb over
 * healthy markup.
 *
 * So the hands are ours and the voice stays TypeScript's. Everything below is recomputed from
 * the parse and the index — the same two readers the card uses — and reported by nobody.
 */

import {
  attributeValueSpan,
  documentRoots,
  span,
  walk,
  type Attribute,
  type ElementNode,
  type Span,
} from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { Contract } from '../mode.js';
import type { WorkspaceIndex } from '../workspace-index.js';

/** The `.` that makes an attribute a property binding (decision 23). */
const PROPERTY_PREFIX = '.';

/** A required prop that is not passed, or is passed with nothing in it. */
export interface MissingProps {
  readonly kind: 'missing-props';
  readonly tag: string;
  /** The open tag, which is what the bulb underlines. */
  readonly at: Span;
  /** The required props with no value, in declaration order. */
  readonly names: readonly string[];
  /** Where a prop that is not written at all goes: just before the `>`. */
  readonly insertAt: number;
  /** The attributes that are written but empty, keyed by prop name. */
  readonly empty: ReadonlyMap<string, Span>;
}

/** A `.prop` the component does not declare. */
export interface UnknownProp {
  readonly kind: 'unknown-prop';
  readonly tag: string;
  /** The NAME, `.` included: what a rename replaces. */
  readonly at: Span;
  readonly written: string;
  /** The declared prop it was most likely meant to be, when one is close enough. */
  readonly suggestion?: string;
}

/** A `slot="x"` the host does not declare. */
export interface UnknownSlot {
  readonly kind: 'unknown-slot';
  /** The HOST — the component this element is projected into. */
  readonly tag: string;
  /** The name inside the quotes: what a rename replaces. */
  readonly at: Span;
  /** The whole `slot="x"` attribute plus the space before it: what a removal takes out. */
  readonly attribute: Span;
  readonly written: string;
  /** Every slot the host declares. Empty means the only repair is to take the attribute off. */
  readonly declared: readonly string[];
}

export type ContractIssue = MissingProps | UnknownProp | UnknownSlot;

/**
 * The contract of the component `tag` opens, or nothing when this file cannot see it.
 *
 * Two lookups and no filesystem: the `<link>`s of this document resolve the tag to an `href`
 * (the file registry SDD-23 already builds), and the index resolves that `href` to the entry
 * whose contract the card also reads. A tag with no `<link>` is `FUD0191`'s business and has
 * its own bulb already.
 */
function contractOfTag(
  cached: CachedDocument,
  index: WorkspaceIndex,
  tag: string,
): Contract | undefined {
  const href = cached.registry.component(tag);
  if (href === undefined) return undefined;
  return index.resolve(cached.path, href)?.contract;
}

/** The `.prop` attributes of an element, in source order, without the leading `.`. */
function writtenProps(el: ElementNode): readonly { name: string; attr: Attribute }[] {
  const out: { name: string; attr: Attribute }[] = [];
  for (const attr of el.attributes) {
    if (typeof attr.name !== 'string' || !attr.name.startsWith(PROPERTY_PREFIX)) continue;
    const name = attr.name.slice(PROPERTY_PREFIX.length);
    // A bare `.` is FUD0093's: there is no name to judge and none to suggest.
    if (name !== '') out.push({ name, attr });
  }
  return out;
}

/**
 * Whether an attribute carries nothing — `.id`, `.id=`, `.id=""`.
 *
 * All three are the same mistake from the author's side: the prop is named and the value is
 * not there yet. The type checker only sees the last two (the first is `undefined`, which for
 * a required prop it reports too), and the bulb has to cover the state the tag is in WHILE it
 * is being written, which is all three.
 */
function isEmptyValue(source: string, attr: Attribute): boolean {
  if (attr.value.length === 0) return true;
  const inside = attributeValueSpan(source, attr);
  return inside !== undefined && inside.end === inside.start;
}

/** Where a new attribute goes: just before the `>` of the open tag, or before a `/>`. */
function insertionPoint(source: string, el: ElementNode): number {
  const beforeClose = el.openSpan.end - 1;
  return source.charAt(beforeClose - 1) === '/' ? beforeClose - 1 : beforeClose;
}

/**
 * Span of the attribute NAME. SDD-05 keeps no separate one, but a literal name is always the
 * head of the attribute, so it ends `name.length` characters in.
 */
function nameSpan(attr: Attribute, name: string): Span {
  return span(attr.span.start, Math.min(attr.span.start + name.length, attr.span.end));
}

/** The attribute plus the whitespace that separates it from what precedes it. */
function withLeadingSpace(source: string, at: Span): Span {
  let start = at.start;
  while (start > 0 && /\s/u.test(source.charAt(start - 1))) start--;
  return span(start, at.end);
}

/**
 * The literal `slot="…"` of an element, with the span of its value.
 *
 * Nothing for a `slot` with no value and nothing for an interpolated one: `slot="@(x)"` names
 * a slot whose identity is not known until it runs, and a repair cannot rename what it cannot
 * read.
 */
function staticSlot(el: ElementNode): { readonly name: string; readonly at: Span; readonly attr: Attribute } | undefined {
  for (const attr of el.attributes) {
    if (attr.name !== 'slot') continue;
    const only = attr.value.length === 1 ? attr.value[0] : undefined;
    if (only?.type !== 'attribute-text' || only.value === '') return undefined;
    return { name: only.value, at: only.span, attr };
  }
  return undefined;
}

/**
 * Whether `.name` is written anywhere in this open tag's text, on a name boundary.
 *
 * Text, and knowingly so: it is asked precisely where the parse could not read the tag, which
 * is the one place a tree cannot answer. Nothing is repaired from it — it only ever takes an
 * insertion away.
 */
function spellsProp(openText: string, name: string): boolean {
  const at = openText.indexOf(`${PROPERTY_PREFIX}${name}`);
  if (at === -1) return false;
  return !/[-\w]/u.test(openText.charAt(at + name.length + 1));
}

/** Levenshtein distance, iterative and over one row. */
function distance(a: string, b: string): number {
  let previous = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      row.push(Math.min(row[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost));
    }
    previous = row;
  }
  return previous[b.length]!;
}

/**
 * The declared name `written` was most likely meant to be, or nothing.
 *
 * «Close enough» is a third of the longer name, which is the ratio TypeScript itself uses for
 * its own spelling suggestions. Without a bound, `.a` on a component with a `.zzzzz` would be
 * offered as a correction, and a repair the author has to think about is worse than none: this
 * is a bulb, and what it offers has to be obviously right.
 */
function closest(written: string, declared: readonly string[]): string | undefined {
  let best: { name: string; d: number } | undefined;
  for (const name of declared) {
    const d = distance(written.toLowerCase(), name.toLowerCase());
    if (best === undefined || d < best.d) best = { name, d };
  }
  if (best === undefined) return undefined;
  const limit = Math.max(written.length, best.name.length) / 3;
  return best.d <= limit ? best.name : undefined;
}

/**
 * Every contract mistake in this document, in source order.
 *
 * The whole document rather than the requested range: the caller filters by range anyway, and
 * a walk that stops early would have to answer «is this element inside the range» with the
 * element's span, which for a host is the span of everything it contains.
 */
export function contractIssues(
  cached: CachedDocument,
  index: WorkspaceIndex,
): readonly ContractIssue[] {
  const issues: ContractIssue[] = [];
  const source = cached.source;

  // A component's own host wrapper is its IDENTITY (decision 75), not a use of itself: nobody
  // passes props to it there.
  const ownHost =
    cached.document.type === 'component-document' ? cached.document.host : undefined;

  walk(documentRoots(cached.document), {
    element(el, host) {
      const slot = staticSlot(el);
      if (slot !== undefined && host !== undefined) {
        const hostContract = contractOfTag(cached, index, host.name);
        if (hostContract !== undefined && !hostContract.slots.includes(slot.name)) {
          issues.push({
            kind: 'unknown-slot',
            tag: host.name,
            at: slot.at,
            attribute: withLeadingSpace(source, slot.attr.span),
            written: slot.name,
            declared: hostContract.slots,
          });
        }
      }

      if (el === ownHost) return;
      const contract = contractOfTag(cached, index, el.name);
      if (contract === undefined) return;

      const written = writtenProps(el);
      const declaredNames = contract.props.map((prop) => prop.name);

      for (const prop of written) {
        if (declaredNames.includes(prop.name)) continue;
        const suggestion = closest(
          prop.name,
          // A name already written on this tag is not a suggestion: renaming `.idd` to a `.id`
          // that is right there would trade one error for a duplicate attribute.
          declaredNames.filter((name) => !written.some((w) => w.name === name)),
        );
        issues.push({
          kind: 'unknown-prop',
          tag: el.name,
          at: nameSpan(prop.attr, `${PROPERTY_PREFIX}${prop.name}`),
          written: prop.name,
          ...(suggestion === undefined ? {} : { suggestion }),
        });
      }

      // Required, and «passed» means passed with something in it. `.id=` is the state the tag
      // is in halfway through being written, and that is exactly when the bulb is asked for.
      const openText = source.slice(el.openSpan.start, el.openSpan.end);
      const empty = new Map<string, Span>();
      const names: string[] = [];
      for (const prop of contract.props) {
        if (!prop.required) continue;
        const found = written.find((w) => w.name === prop.name);
        if (found !== undefined) {
          if (!isEmptyValue(source, found.attr)) continue;
          names.push(prop.name);
          empty.set(prop.name, found.attr.span);
          continue;
        }
        // Absent from the ATTRIBUTES but present in the TEXT: a tag mid-typing does not parse
        // into the attributes it will have — `<app-input .id= .name=>` reads as one unquoted
        // value (FUD0056) and swallows the second name — and inserting a `.name` that is
        // already written there produces a duplicate. Not offering it is the smaller wrong:
        // the author has FUD0056's own bulb for the state the tag is actually in.
        if (!spellsProp(openText, prop.name)) names.push(prop.name);
      }
      if (names.length > 0) {
        issues.push({
          kind: 'missing-props',
          tag: el.name,
          at: el.openSpan,
          names,
          insertAt: insertionPoint(source, el),
          empty,
        });
      }
    },
  });

  return issues;
}
