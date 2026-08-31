/**
 * What a `.fud` IS (SDD-24 §4.5, decision 51 and SDD-21).
 *
 * The role is read from the structured document, never from the file name or the folder: a
 * layout is a layout because it has a doctype and one `@RenderBody()`, and `_layout.fud` is
 * a convention of the CLI, not a rule of the language.
 *
 * Pure — the disk enters in the workspace index, which is the only module that reads it.
 */

import {
  documentRoots,
  extractCode,
  walk,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';

/** The four roles the `href` completion filters by (§4.2). */
export type FudRole = 'component' | 'page' | 'route' | 'layout';

/** The role of a parsed document. */
export function roleOf(document: StructuredDocument): FudRole {
  switch (document.type) {
    case 'component-document':
      return 'component';
    case 'page-document':
      return 'page';
    case 'route-document':
      return 'route';
    default:
      return 'layout';
  }
}

/**
 * The tag a file defines, or `''` when it defines none.
 *
 * Only a component owns a tag: its markup IS its own tag wrapping the shadow template
 * (decision 75). A page, a route and a layout are reached by URL or by `<link>`, never by
 * being written as an element.
 */
export function tagOf(document: StructuredDocument): string {
  return document.type === 'component-document' ? document.name : '';
}

/**
 * The sections a layout declares with `@RenderSection`, in source order.
 *
 * Only a layout declares any: a route FILLS sections, it does not declare them. A directive
 * whose argument was not an identifier (FUD0433) carries an empty name and is dropped — it
 * would complete to nothing.
 */
export function sectionsOf(document: StructuredDocument): readonly string[] {
  if (document.type !== 'layout-document') return [];
  return document.renderSections.map((section) => section.name).filter((name) => name !== '');
}

/** One prop of a component, as a consumer of that component sees it. */
export interface ContractProp {
  readonly name: string;
  /** Written WITHOUT a `?` in the type argument. Unprovable reads as optional (BUG-23 §4.4). */
  readonly required: boolean;
}

/**
 * Everything a component declares to whoever writes its tag (SDD-36 §3.2).
 *
 * It is the card the hover shows and the answer the contract rules need, and it is ONE thing
 * because those are one question asked twice. The editor used to know only the required prop
 * names — enough to expand a tag, not enough to say what the tag is — and the slots and the
 * events lived only in the build, where the graph is resolved.
 *
 * Everything here is read from the parse. No TypeScript program is involved, which is what lets
 * the card appear over a component that is not open, in a project whose types have not loaded,
 * and in the second before a cold editor is ready. The one thing the parse cannot give is a
 * prop's TYPE; that arrives separately and may not arrive at all.
 */
export interface Contract {
  readonly props: readonly ContractProp[];
  /** The names of `<slot name="…">`, in source order. The default slot is not one. */
  readonly slots: readonly string[];
  /** The events the component emits, from every `emit('…')` whose name resolves statically. */
  readonly events: readonly string[];
  /** The first JSDoc of the `@code` block — decision 107. */
  readonly doc?: string;
}

/** The empty contract, which is what everything that is not a component declares. */
const NO_CONTRACT: Contract = { props: [], slots: [], events: [] };

/**
 * The contract of a component, or the empty one for anything else.
 *
 * Only a component has one: a page, a route and a layout are reached by URL or by `<link>`,
 * never by being written as an element, so there is nobody to declare a contract TO.
 */
export function contractOf(source: string, document: StructuredDocument): Contract {
  if (document.type !== 'component-document') return NO_CONTRACT;

  const slots = slotNames(document);
  if (document.code === undefined) return { props: [], slots, events: [] };

  const code = extractCode(source, document);
  const doc = firstDocComment(source, document.code.span);

  return {
    props: code.props.map((prop) => ({ name: prop.name, required: !prop.optional })),
    slots,
    // A name that did not resolve statically is absent on purpose: `emit(name)` with a variable
    // is a real emission the card cannot name, and inventing `name` for it would be worse than
    // the gap. Duplicates collapse — a component that emits `change` from three places emits
    // one event.
    events: [
      ...new Set(code.emitCalls.flatMap((call) => (call.name === undefined ? [] : [call.name]))),
    ],
    ...(doc === undefined ? {} : { doc }),
  };
}

/**
 * The names of the `<slot name="…">` this component declares, in source order.
 *
 * A literal name and nothing else: `name=""` is the default slot (decision 44) and an
 * interpolated one is not a name any consumer can write into a `slot=` attribute.
 */
function slotNames(document: StructuredDocument): readonly string[] {
  const names: string[] = [];
  walk(documentRoots(document), {
    element(el) {
      if (el.name !== 'slot') return;
      for (const attribute of el.attributes) {
        if (attribute.name !== 'name') continue;
        const only = attribute.value.length === 1 ? attribute.value[0] : undefined;
        if (only?.type === 'attribute-text' && only.value !== '') names.push(only.value);
      }
    },
  });
  return names;
}

/**
 * The first `/** … *\/` of the `@code` block, as the text the author wrote (decision 107).
 *
 * Read from the SOURCE of the block rather than from the AST, and that is the whole reason the
 * rule is «the first one»: Oxc drops comments from the tree it returns, so a comment cannot be
 * attached to the declaration it precedes without a second pass nobody needs. One rule, one
 * position, and a place the author would put it anyway.
 *
 * The stars and the indentation come off, because they are how a JSDoc is written and not part
 * of what it says.
 */
function firstDocComment(source: string, at: Span): string | undefined {
  const block = source.slice(at.start, at.end);
  const match = /\/\*\*([\s\S]*?)\*\//u.exec(block);
  if (match === null) return undefined;

  const text = (match[1] as string)
    .split('\n')
    .map((line) => line.replace(/^\s*\*? ?/u, '').trimEnd())
    .join('\n')
    .trim();
  return text === '' ? undefined : text;
}

/**
 * The `href` of this file's `<link rel="layout">`, or `''` when it declares none.
 *
 * Both a route and a nested layout may declare one (decisions 81, 87); the empty string is
 * also what the parser leaves behind when the `href` is absent or interpolated (FUD0436).
 */
export function layoutHrefOf(document: StructuredDocument): string {
  if (document.type === 'route-document') return document.layoutHref;
  if (document.type === 'layout-document') return document.layoutHref ?? '';
  return '';
}
