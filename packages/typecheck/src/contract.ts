/**
 * `@fudic/typecheck/contract` — everything a component declares to whoever writes its tag.
 *
 * It is the card the editor's hover shows, the answer the contract rules need, and what a tool
 * that is not an editor reads to learn how a component is used. It lives here and not in the
 * language server because this is the package the editor and the build already share: a reader
 * that is not an editor gets the contract without starting a language server.
 *
 * Two halves. `contractOf` reads the parse and nothing else — no TypeScript program is
 * involved, which is what lets the card appear over a component that is not open, in a project
 * whose types have not loaded. `typedContract` adds what only the checker knows, and may not
 * arrive at all.
 */

import type * as ts from 'typescript';
import {
  codeOfDocument,
  documentRoots,
  parseCssRules,
  walk,
  type Attribute,
  type CodeBlockNode,
  type ComponentDocument,
  type CssRule,
  type ElementNode,
  type EmitCall,
  type LayoutDocument,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';

/** One prop of a component, as a consumer of that component sees it. */
export interface ContractProp {
  readonly name: string;
  /** Written WITHOUT a `?` in the type argument. Unprovable reads as optional. */
  readonly required: boolean;
  /**
   * The declared type as written — `string`, `Post[]`, `'a' | 'b'` — when the file states one;
   * with a checker, as TypeScript prints it.
   */
  readonly type?: string;
  /** The default value as written in the destructuring: `'primary'`, `0`, `[]`. */
  readonly default?: string;
  /** Its JSDoc (needs a checker). */
  readonly doc?: string;
}

/** One event a component emits. */
export interface ContractEvent {
  readonly name: string;
  /** The type of the detail as TypeScript prints it (needs a checker). Absent when no `emit` passes one. */
  readonly detail?: string;
  /** The JSDoc right before the first statement that emits it. */
  readonly doc?: string;
}

/**
 * Everything a component declares to whoever writes its tag.
 *
 * ONE thing because the card and the contract rules ask one question twice.
 */
export interface Contract {
  /** The first TOP-LEVEL JSDoc of the `@code` block (decision 107). */
  readonly doc?: string;
  readonly props: readonly ContractProp[];
  /** The names of `<slot name="…">`, in source order. The default slot is not one. */
  readonly slots: readonly string[];
  /** True when the template has a `<slot>` without a name. */
  readonly defaultSlot: boolean;
  /** The events the component emits, from every `emit('…')` whose name resolves statically. */
  readonly events: readonly ContractEvent[];
  /** The literal names of every `part="…"` in its template, in source order, without repeats. */
  readonly parts: readonly string[];
  /** True when some `part` takes an expression: then `parts` may not be all. */
  readonly partsDynamic: boolean;
  /** The custom properties its `<style>` reads with `var(--…)`, in source order, without repeats. */
  readonly tokens: readonly string[];
}

/** The empty contract, which is what everything that is not a component declares. */
const NO_CONTRACT: Contract = {
  props: [],
  slots: [],
  defaultSlot: false,
  events: [],
  parts: [],
  partsDynamic: false,
  tokens: [],
};

/**
 * Where the detail of each event is written, in `.fud` coordinates, for `typedContract`.
 *
 * Kept beside the contract rather than in it: a span is a fact about the source the contract was
 * read from, not something a consumer of the component reads.
 */
const detailSpans = new WeakMap<Contract, ReadonlyMap<string, readonly Span[]>>();

/**
 * The contract of a component or of a LAYOUT, and the empty one for anything else.
 *
 * A page and a route have none: they are reached by URL, so there is nobody to declare a
 * contract TO. A layout declares props with the same `props<T>()` a component uses, and the
 * route that links to it is exactly the somebody. What it never has is slots, events, parts or
 * tokens: nobody writes it as an element.
 *
 * One Oxc invocation per document: `codeOfDocument` memoizes the extraction on the document, so
 * every reader below shares it.
 */
export function contractOf(source: string, document: StructuredDocument): Contract {
  if (document.type === 'layout-document') {
    return document.code === undefined
      ? NO_CONTRACT
      : { ...NO_CONTRACT, props: propContract(source, document) };
  }
  if (document.type !== 'component-document') return NO_CONTRACT;

  const markup = markupOf(document);
  if (document.code === undefined) return markup;

  const calls = codeOfDocument(source, document).emitCalls;
  const doc = componentDoc(source, document.code);
  const contract: Contract = {
    ...markup,
    props: propContract(source, document),
    events: eventsOf(source, calls),
    ...(doc === undefined ? {} : { doc }),
  };
  detailSpans.set(contract, detailsOf(calls));
  return contract;
}

/** The props a file declares, as a consumer reads them: name, `?`, type source and default. */
function propContract(
  source: string,
  document: ComponentDocument | LayoutDocument,
): readonly ContractProp[] {
  return codeOfDocument(source, document).props.map((prop) => ({
    name: prop.name,
    required: !prop.optional,
    ...(prop.type === undefined ? {} : { type: prop.type }),
    ...(prop.def === undefined ? {} : { default: prop.def }),
  }));
}

/**
 * What a component's markup declares: its slots, its parts and the tokens its `<style>` reads.
 *
 * One walk of the parse, which is all three need.
 */
function markupOf(document: ComponentDocument): Contract {
  const slots: string[] = [];
  let defaultSlot = false;
  const parts = new Set<string>();
  let partsDynamic = false;
  const tokens = new Set<string>();

  walk(documentRoots(document), {
    element(el) {
      if (el.name === 'slot') {
        const name = slotName(el);
        if (name === '') defaultSlot = true;
        else if (name !== undefined) slots.push(name);
      }
      if (el.name === 'style') for (const token of tokensRead(el)) tokens.add(token);
      for (const attribute of el.attributes) {
        if (attribute.name !== 'part') continue;
        const value = literalOf(attribute);
        if (value === undefined) partsDynamic = true;
        else for (const word of value.split(/\s+/u)) if (word !== '') parts.add(word);
      }
    },
  });
  return { ...NO_CONTRACT, slots, defaultSlot, parts: [...parts], partsDynamic, tokens: [...tokens] };
}

/**
 * The name of a `<slot>`: `''` for the default one — no `name`, or `name=""` (decision 44) —
 * and nothing for an interpolated one, which is not a name any consumer can write into `slot=`.
 */
function slotName(slot: ElementNode): string | undefined {
  const attribute = slot.attributes.find((it) => it.name === 'name');
  return attribute === undefined ? '' : literalOf(attribute);
}

/** The value of an attribute when it is literal text throughout; nothing when it holds an expression. */
function literalOf(attribute: Attribute): string | undefined {
  let text = '';
  for (const part of attribute.value) {
    if (part.type !== 'attribute-text') return undefined;
    text += part.value;
  }
  return text;
}

/** `var(--name` — the custom property a value reads. */
const VAR_READ = /var\(\s*(--[\w-]+)/gu;

/**
 * The custom properties a `<style>` reads with `var(…)`, in source order.
 *
 * Read off the declarations of the rule tree rather than off the text: a `var(--x)` inside a
 * comment reads nothing.
 */
function tokensRead(style: ElementNode): readonly string[] {
  const body = style.children[0];
  if (body?.type !== 'style-content') return [];
  const css = body.parts.map((part) => part.value).join('');
  const found: string[] = [];
  const visit = (rules: readonly CssRule[]): void => {
    for (const rule of rules) {
      if (rule.type === 'style-rule') {
        for (const declaration of rule.declarations) {
          const value = css.slice(declaration.value.start, declaration.value.end);
          for (const match of value.matchAll(VAR_READ)) found.push(match[1]!);
        }
        visit(rule.children);
      } else if (rule.type === 'at-block') {
        visit(rule.children ?? []);
      }
    }
  };
  visit(parseCssRules(css).value.rules);
  return found;
}

/**
 * The events, one per name in the order they are first emitted.
 *
 * A name that did not resolve statically is absent on purpose: `emit(name)` with a variable is a
 * real emission the card cannot name, and inventing `name` for it would be worse than the gap.
 * The doc is the one before the FIRST statement that emits the event.
 */
function eventsOf(source: string, calls: readonly EmitCall[]): readonly ContractEvent[] {
  const events = new Map<string, ContractEvent>();
  for (const call of calls) {
    if (call.name === undefined || events.has(call.name)) continue;
    const doc = docBefore(source, call.statement);
    events.set(call.name, { name: call.name, ...(doc === undefined ? {} : { doc }) });
  }
  return [...events.values()];
}

/** Where each named event's detail is written, by name, in the order of the calls. */
function detailsOf(calls: readonly EmitCall[]): ReadonlyMap<string, readonly Span[]> {
  const spans = new Map<string, Span[]>();
  for (const call of calls) {
    if (call.name === undefined || call.detail === undefined) continue;
    spans.set(call.name, [...(spans.get(call.name) ?? []), call.detail]);
  }
  return spans;
}

/** The `/** … *\/` that only whitespace separates from `at`, as its text. */
function docBefore(source: string, at: number): string | undefined {
  const before = source.slice(0, at).trimEnd();
  if (!before.endsWith(BLOCK_CLOSE)) return undefined;
  const open = before.lastIndexOf('/*', before.length - BLOCK_CLOSE.length - 1);
  // `/*` alone is a comment and not a doc. A `*/` always has a `/*` before it in valid code;
  // in a file being typed it may not, and then there is nothing to read.
  if (open === -1 || before.charAt(open + 2) !== '*') return undefined;
  return unstarred(before.slice(open + DOC_OPEN.length, before.length - BLOCK_CLOSE.length));
}

/**
 * The component's own JSDoc: the first `/** … *\/` written at the TOP LEVEL of the `@code`
 * (decision 107).
 *
 * Read from the SOURCE rather than from the AST, because Oxc drops comments from the tree it
 * returns. Top level is the whole of the rule: a member's JSDoc lives inside the braces of a
 * type, the component's is written beside the declarations, at depth zero.
 *
 * Strings and the other comment shapes are skipped rather than counted, because a `{` inside
 * either is not a brace: `const a = "{";` would otherwise hide everything after it one level
 * too deep.
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
 * Exported because a prop's doc is read from the projection and a component's from the parse,
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

/** The doc of a component: the first top-level JSDoc of a chunk of its `@code`. */
function componentDoc(source: string, code: CodeBlockNode): string | undefined {
  for (const part of code.parts) {
    const doc = topLevelDocComment(source.slice(part.js.start, part.js.end));
    if (doc !== undefined) return doc;
  }
  return undefined;
}

/**
 * The name the projection exports a component's contract under.
 *
 * The projection writes `export type $Props = typeof $p0;` into every client virtual, and this
 * is the other end of that sentence.
 */
const PROPS_EXPORT = '$Props';

/** How a JSDoc opens and how any block comment closes. */
const DOC_OPEN = '/**';
const BLOCK_CLOSE = '*/';

/**
 * The three kinds of value a repair can write by itself, plus everything else.
 *
 * Three and not thirty: these are the types that have an obvious empty value, and a repair may
 * only write a value that is obvious.
 */
export type PropHolds = 'string' | 'number' | 'boolean' | 'other';

/** What only TypeScript knows about a prop. */
export interface PropDetail {
  /** As the checker spells it, which is as the author declared it. */
  readonly type: string;
  /** The JSDoc the author wrote on the member of `props<T>()` — decision 107. */
  readonly doc?: string;
  /** What kind of value the prop holds, as coarsely as a repair needs to know. */
  readonly holds: PropHolds;
}

/** No details, which is what every degraded path answers with. */
const NO_DETAILS: ReadonlyMap<string, PropDetail> = new Map();

/**
 * The type and the doc of each prop, read from the projection.
 *
 * The only half of the contract that is allowed not to arrive. Every step below can come back
 * empty for a reason that is normal rather than exceptional — no TypeScript was loaded, the
 * program has not been built yet, the component is not in it, or it declares no `props<T>()`.
 * All of them answer the same way: an empty map.
 *
 * The checker, never the text. `$Props` is `typeof $p0` and `$p0` is a `props<T>()` call, so
 * the members are reachable only by resolving that chain.
 *
 * TypeScript arrives as a TYPE only: the program comes from whoever holds the service, never
 * as a module this file imported.
 */
export function propDetails(
  languageService: ts.LanguageService | undefined,
  file: string,
): ReadonlyMap<string, PropDetail> {
  const program = languageService?.getProgram();
  if (program === undefined) return NO_DETAILS;

  // A `.fud` IS the program's file name: the language plugin gives TypeScript the client
  // virtual as that file's script, so no name has to be derived here.
  const source = program.getSourceFile(file);
  if (source === undefined) return NO_DETAILS;

  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (module === undefined) return NO_DETAILS;

  const contract = checker.getExportsOfModule(module).find((it) => it.name === PROPS_EXPORT);
  if (contract === undefined) return NO_DETAILS;

  const details = new Map<string, PropDetail>();
  for (const prop of checker.getDeclaredTypeOfSymbol(contract).getProperties()) {
    const declared = checker.getTypeOfSymbolAtLocation(prop, source);
    const type = checker.typeToString(declared);
    const doc =
      prop
        .getDocumentationComment(checker)
        .map((part) => part.text)
        .join('') || trailingDoc(prop.declarations?.[0]);
    details.set(prop.name, {
      type,
      holds: holdsOf(checker, declared),
      ...(doc === undefined || doc === '' ? {} : { doc }),
    });
  }
  return details;
}

/**
 * Where a `.fud` offset lands in the client projection the program holds, or nothing.
 *
 * The holder of the service owns the mapping — the language server through its virtual code,
 * the build through Volar's maps — so it is handed in rather than rebuilt here.
 */
export type ToGenerated = (offset: number) => number | undefined;

/**
 * The same contract with each prop's type and doc, and each event's detail, as the checker
 * reads them.
 *
 * A prop the checker does not know keeps what the parse said: the typed half adds, it never
 * takes away. The detail needs `toGenerated` too, because it is the type of an expression the
 * author wrote and the checker only knows the projection's offsets; without it, no detail.
 */
export function typedContract(
  contract: Contract,
  service: ts.LanguageService | undefined,
  file: string,
  toGenerated?: ToGenerated,
): Contract {
  const details = propDetails(service, file);
  const events = eventDetails(contract, service, file, toGenerated);
  if (details.size === 0 && events.size === 0) return contract;
  return {
    ...contract,
    props: contract.props.map((prop) => {
      const detail = details.get(prop.name);
      if (detail === undefined) return prop;
      return {
        ...prop,
        type: detail.type,
        ...(detail.doc === undefined ? {} : { doc: detail.doc }),
      };
    }),
    events: contract.events.map((event) => {
      const detail = events.get(event.name);
      return detail === undefined ? event : { ...event, detail };
    }),
  };
}

/**
 * The detail type of each event, by name: the distinct types of every second argument, in the
 * order the calls are written, joined with ` | `.
 *
 * An argument whose offset the projection did not copy, or where no expression of the same
 * length starts, says nothing — it is skipped rather than guessed.
 */
function eventDetails(
  contract: Contract,
  service: ts.LanguageService | undefined,
  file: string,
  toGenerated: ToGenerated | undefined,
): ReadonlyMap<string, string> {
  const spans = detailSpans.get(contract);
  const program = service?.getProgram();
  const source = program?.getSourceFile(file);
  const found = new Map<string, string>();
  if (spans === undefined || toGenerated === undefined || source === undefined) return found;

  const checker = program!.getTypeChecker();
  for (const [name, written] of spans) {
    const types = new Set<string>();
    for (const span of written) {
      const start = toGenerated(span.start);
      const node = start === undefined ? undefined : nodeSpanning(source, start, start + span.end - span.start);
      if (node !== undefined) types.add(checker.typeToString(checker.getTypeAtLocation(node)));
    }
    if (types.size > 0) found.set(name, [...types].join(' | '));
  }
  return found;
}

/**
 * The outermost node that covers exactly `[start, end)`.
 *
 * Walked with the node's own `forEachChild`, because this module holds TypeScript as a type
 * only: `ts.forEachChild` and `SyntaxKind` are values of a copy the program may not share.
 */
function nodeSpanning(node: ts.Node, start: number, end: number): ts.Node | undefined {
  if (node.getStart() === start && node.end === end) return node;
  return node.forEachChild((child) =>
    child.pos <= start && end <= child.end ? nodeSpanning(child, start, end) : undefined,
  );
}

/**
 * What kind of value a prop holds.
 *
 * Asked with the checker's own public methods and no `TypeFlags`, because the enum is a runtime
 * value and this module holds TypeScript as a TYPE only. So the primitives are recognised by the
 * one name each of them prints as.
 *
 * A union answers `string` when ANY member takes one, because a string is then a legal value.
 * Otherwise a union has to be unanimous, which is what makes `boolean` work: TypeScript expands
 * it to `true | false` and both halves answer `boolean`.
 */
function holdsOf(checker: ts.TypeChecker, type: ts.Type): PropHolds {
  if (type.isUnion()) {
    const kinds = new Set(type.types.map((member) => holdsOf(checker, member)));
    if (kinds.has('string')) return 'string';
    return kinds.size === 1 ? ([...kinds][0] as PropHolds) : 'other';
  }
  if (type.isStringLiteral()) return 'string';
  if (type.isNumberLiteral()) return 'number';

  switch (checker.typeToString(type)) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    // `true` and `false`, and never `boolean`: the checker hands a `boolean` prop over as the
    // union of its two halves, so this recursion only ever meets them one at a time.
    case 'true':
    case 'false':
      return 'boolean';
    default:
      return 'other';
  }
}

/**
 * The JSDoc written AFTER the member rather than before it — `id: number /** … *\/;`.
 *
 * TypeScript does not see this one: a JSDoc documents what FOLLOWS it. But it is where the
 * formatter parks it, so fudic accepts both (decision 107).
 *
 * The LAST thing in the declaration and nothing else: that is what keeps a comment nested
 * inside the type, `Map<string, { /** … *\/ x: number }>`, from being read as the member's own.
 */
function trailingDoc(declaration: ts.Declaration | undefined): string | undefined {
  if (declaration === undefined) return undefined;

  const text = declaration.getSourceFile().text.slice(declaration.getStart(), declaration.end);
  // `;` and `,` are how a member ends, and either may follow the comment.
  const written = text.replace(/[\s;,]+$/u, '');
  if (!written.endsWith(BLOCK_CLOSE)) return undefined;

  const open = written.lastIndexOf(DOC_OPEN);
  if (open === -1) return undefined;
  return unstarred(written.slice(open + DOC_OPEN.length, written.length - BLOCK_CLOSE.length));
}
