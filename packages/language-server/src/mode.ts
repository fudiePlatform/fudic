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
  type CodeBlockNode,
  type ComponentDocument,
  type LayoutDocument,
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
  /**
   * The source of its declared type — `string`, `Post[]`, `'a' | 'b'` — when the file states one.
   *
   * Read off the parse like everything else here, so it is TEXT and never a resolved type. Its
   * one reader is the repair of SDD-40 §3.5, which writes a value OF the type and cannot do
   * that without having read it. Absent means «not stated, or not provable», and the repair
   * then writes what most props take.
   */
  readonly type?: string;
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
  /** The first TOP-LEVEL JSDoc of the `@code` block — decision 107. */
  readonly doc?: string;
}

/** The empty contract, which is what everything that is not a component declares. */
const NO_CONTRACT: Contract = { props: [], slots: [], events: [] };

/**
 * The contract of a component or of a LAYOUT, and the empty one for anything else.
 *
 * A page and a route have none: they are reached by URL, so there is nobody to declare a
 * contract TO. A layout was in that list until SDD-40 and is not any more — it declares props
 * with the same `props<T>()` a component uses, and the route that links to it is exactly the
 * somebody. What it never has is slots or events: nobody writes it as an element.
 */
export function contractOf(source: string, document: StructuredDocument): Contract {
  if (document.type === 'layout-document') {
    return document.code === undefined
      ? NO_CONTRACT
      : { props: propContract(source, document), slots: [], events: [] };
  }
  if (document.type !== 'component-document') return NO_CONTRACT;

  const slots = slotNames(document);
  if (document.code === undefined) return { props: [], slots, events: [] };

  const code = extractCode(source, document);
  const doc = componentDoc(source, document.code);

  return {
    props: propContract(source, document),
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
 * The props a file declares, as a consumer reads them: the name, the `?`, and the type source.
 *
 * One function for the two roles that have props — a component and, since SDD-40, a layout —
 * because it is one declaration read one way. `extractCode` is memoized per document, so
 * asking here costs no second Oxc invocation.
 */
function propContract(
  source: string,
  document: ComponentDocument | LayoutDocument,
): readonly ContractProp[] {
  return extractCode(source, document).props.map((prop) => ({
    name: prop.name,
    required: !prop.optional,
    ...(prop.type === undefined ? {} : { type: prop.type }),
  }));
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
 * The component's own JSDoc: the first `/** … *\/` written at the TOP LEVEL of the `@code`
 * (decision 107).
 *
 * Read from the SOURCE rather than from the AST, because Oxc drops comments from the tree it
 * returns — so a comment cannot be attached to the declaration it precedes without a second
 * pass nobody needs.
 *
 * Top level is the whole of the rule, and «first» alone was not enough. The author documents a
 * prop the way TypeScript says to, on the member:
 *
 *     type Props = {
 *       /** El id *\/
 *       id: number;
 *     };
 *
 * and with «the first one» that member's doc became the COMPONENT's description — the card
 * introduced `<app-input>` as «El id». A member's JSDoc lives inside the braces of a type; the
 * component's is written beside the declarations, at depth zero. That is a difference the text
 * states plainly and it costs one counter to read.
 *
 * Strings and the other comment shapes are skipped rather than counted, because a `{` inside
 * either is not a brace: `const a = "{";` would otherwise hide everything after it one level
 * too deep.
 *
 * The stars and the indentation come off, because they are how a JSDoc is written and not part
 * of what it says.
 */
function topLevelDocComment(text: string): string | undefined {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);

    if (char === '{' || char === '(' || char === '[') {
      depth++;
      continue;
    }
    if (char === '}' || char === ')' || char === ']') {
      depth--;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      i = endOfString(text, i, char);
      continue;
    }
    if (char !== '/') continue;

    const next = text.charAt(i + 1);
    if (next === '/') {
      i = text.indexOf('\n', i);
      if (i === -1) return undefined;
      continue;
    }
    if (next !== '*') continue;

    const close = text.indexOf('*/', i + 2);
    const end = close === -1 ? text.length : close;
    // `/**` and not `/*`, and at the level the declarations are written at.
    if (text.charAt(i + 2) === '*' && depth === 0) return unstarred(text.slice(i + 3, end));
    i = close === -1 ? text.length : close + 1;
  }
  return undefined;
}

/** Past the closing delimiter of the string starting at `open`, or the end of the text. */
function endOfString(text: string, open: number, quote: string): number {
  for (let i = open + 1; i < text.length; i++) {
    const char = text.charAt(i);
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === quote) return i;
  }
  return text.length;
}

/**
 * A JSDoc body as the author meant it to read: without the leading stars and the indent.
 *
 * Exported because the card reads a prop's doc from the projection and this one from the parse,
 * and «what a JSDoc says» has to be one answer however it was reached.
 */
export function unstarred(body: string): string | undefined {
  const text = body
    .split('\n')
    .map((line) => line.replace(/^\s*\*? ?/u, '').trimEnd())
    .join('\n')
    .trim();
  return text === '' ? undefined : text;
}

/**
 * The doc of a component: the first top-level JSDoc of any NEUTRAL chunk of its `@code`.
 *
 * The neutral chunks and not the whole block, because `@server` and `@client` are the other
 * two and neither documents the component — what is written inside a `@client` documents the
 * function it precedes.
 */
function componentDoc(source: string, code: CodeBlockNode): string | undefined {
  for (const part of code.parts) {
    if (part.type !== 'neutral-js') continue;
    const doc = topLevelDocComment(source.slice(part.js.start, part.js.end));
    if (doc !== undefined) return doc;
  }
  return undefined;
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
