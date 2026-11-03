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
  walk,
  type CodeBlockNode,
  type ComponentDocument,
  type LayoutDocument,
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
  /** Its JSDoc (needs a checker). */
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
  /** The events the component emits, from every `emit('…')` whose name resolves statically. */
  readonly events: readonly string[];
}

/** The empty contract, which is what everything that is not a component declares. */
const NO_CONTRACT: Contract = { props: [], slots: [], events: [] };

/**
 * The contract of a component or of a LAYOUT, and the empty one for anything else.
 *
 * A page and a route have none: they are reached by URL, so there is nobody to declare a
 * contract TO. A layout declares props with the same `props<T>()` a component uses, and the
 * route that links to it is exactly the somebody. What it never has is slots or events: nobody
 * writes it as an element.
 *
 * One Oxc invocation per document: `codeOfDocument` memoizes the extraction on the document, so
 * every reader below shares it.
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

  const code = codeOfDocument(source, document);
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

/** The props a file declares, as a consumer reads them: the name, the `?`, and the type source. */
function propContract(
  source: string,
  document: ComponentDocument | LayoutDocument,
): readonly ContractProp[] {
  return codeOfDocument(source, document).props.map((prop) => ({
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
 * The same contract with each prop's type and doc as the checker reads them.
 *
 * A prop the checker does not know keeps what the parse said: the typed half adds, it never
 * takes away.
 */
export function typedContract(
  contract: Contract,
  service: ts.LanguageService | undefined,
  file: string,
): Contract {
  const details = propDetails(service, file);
  if (details.size === 0) return contract;
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
  };
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
