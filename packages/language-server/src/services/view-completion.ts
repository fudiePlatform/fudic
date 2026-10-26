/**
 * What TypeScript may offer where the portable view is written (SDD-61 §4.3).
 *
 * TypeScript's list at `@(xs.|)` is the members of an array — `find`, `join`, `push`, forty of
 * them — and every one but five is `FUD1140` the moment it is accepted. The view is a closed
 * list (§3.3, §3.5 bis), so the list it is offered is the same one:
 *
 *   - after a `.` on a list, `filter`, `map`, `reduce`, `toSorted` and `length`; on a text,
 *     `length`; on anything else, the members that are not methods or functions — a reactive
 *     value is read by calling it, so it stays;
 *   - on a bare name, the same test over the names in scope, and no global but `undefined`;
 *   - in a handler, a `bus:` and a callback, nothing is filtered: that is browser code (§3.11).
 *
 * The SHAPE is the checker's, read off the projection, and the test of «reactive» is the typed
 * pass's own (`isReactive`): one answer, whether it is the editor or the build asking.
 */

import type { CompletionItem } from '@volar/language-service';
import { CompletionItemKind } from 'vscode-languageserver-protocol';
import type { Region } from '@fudic/compiler';
import { isReactive } from '@fudic/typecheck';
import type * as ts from 'typescript';
import { directiveContextAt, expressionValueContextAt, memberContextAt } from './position.js';

/** What the view may read off a list (§3.5 bis). */
const LIST_MEMBERS: ReadonlySet<string> = new Set(['filter', 'map', 'reduce', 'toSorted', 'length']);

/** What the view may read off a text (§3.5). */
const TEXT_MEMBERS: ReadonlySet<string> = new Set(['length']);

/**
 * The words TypeScript files with the globals that the view writes: `undefined` is the one global
 * it reads (§3.2), and the three literals are keywords rather than globals.
 */
const KEPT_WORDS: ReadonlySet<string> = new Set(['undefined', 'true', 'false', 'null']);

/** The `sortText` bands of a name declared where the caret is (see `ts-completion.ts`). */
const LOCAL_BANDS: ReadonlySet<string> = new Set(['10', '11']);

/** The kinds a method or a function comes back as when the checker has no type to ask. */
const CALLABLE_KINDS: ReadonlySet<CompletionItemKind> = new Set([
  CompletionItemKind.Function,
  CompletionItemKind.Method,
]);

/** Every meaning a symbol can have; `forms.ts` says why it is all bits. */
const ALL_MEANINGS = ~0 as ts.SymbolFlags;

/**
 * A callback's value (§3.1): an arrow, or one bare name — a function of the `@code` is passed
 * by name. A chain or a call is a value like any other.
 */
const CALLBACK_VALUE = /^@(?:[\w$]*|\(\s*(?:\([^)]*\)|[\w$]+)\s*=>[\s\S]*)$/;

/**
 * Whether the caret is in the portable view: the positions of §3.1 and not the four that are
 * browser code. Asked of the source, as every position of this package is.
 */
export function inPortableView(source: string, offset: number, region: Region): boolean {
  switch (region.kind) {
    // `@{ … }` is the view; `@code` and `<script>` are not.
    case 'ts':
      return source.slice(region.span.start - 2, region.span.start) === '@{';
    case 'markup':
      return directiveContextAt(source, offset, region) !== undefined || memberContextAt(source, offset, region) !== undefined;
    case 'tag':
    case 'attr-value':
      if (memberContextAt(source, offset, region) === undefined && expressionValueContextAt(source, offset, region) === undefined) {
        return false;
      }
      return !browserCode(source, offset, region);
    case 'expression':
      return !browserCode(source, offset, region);
    default:
      return false;
  }
}

/** The value of an event, of a `bus:` and of a callback (§3.11). */
function browserCode(source: string, offset: number, region: Region): boolean {
  const attribute = region.attribute;
  if (attribute === undefined) return false;
  const name = attribute.name;
  if (typeof name !== 'string') return true;
  if (name.startsWith('@') || name.startsWith('bus:')) return true;
  if (!name.startsWith('.')) return false;

  const written = source.slice(attribute.span.start, offset);
  const value = /=[ \t]*["']?(@[\s\S]*)$/.exec(written);
  return value !== null && CALLBACK_VALUE.test(value[1]!);
}

/** The program over the projection, and where the caret is in it. */
export interface ViewProgram {
  readonly service: ts.LanguageService | undefined;
  /** The file the projection is registered under. */
  readonly file: string;
  /** The caret in the projection. */
  readonly projected: number;
}

/**
 * TypeScript's items at a view position, narrowed to what the view may write.
 *
 * Without a program — TypeScript not loaded, a file not yet in it — the kinds decide alone, and
 * a list is not told from anything else: a smaller wrong answer rather than a silence.
 */
export function portableItems(
  source: string,
  offset: number,
  program: ViewProgram,
  items: readonly CompletionItem[],
): CompletionItem[] {
  const ts = program.service?.getProgram();
  const file = ts?.getSourceFile(program.file);
  const checker = ts?.getTypeChecker();

  const member = /(\?)?\.([\w$]*)$/.exec(source.slice(0, offset));
  if (member !== null) {
    if (checker === undefined || file === undefined) return items.filter((item) => !callableKind(item));
    // The receiver ends just before the `.` (and its `?`); the projection copied it as written,
    // so the distance from the caret is the same on both sides.
    const receiver = nodeAt(file, program.projected - member[0].length - 1);
    return memberItems(checker, receiver, items);
  }

  const inScope = checker === undefined || file === undefined ? undefined : scopeTypes(checker, nodeAt(file, program.projected));
  return items.filter((item) => {
    if (KEPT_WORDS.has(item.label)) return true;
    if (!isLocal(item)) return false;
    const type = inScope?.get(item.label);
    if (type === undefined || checker === undefined) return !callableKind(item);
    return !callable(checker, type);
  });
}

/** The members after a `.`, by the shape of what is before it. */
function memberItems(checker: ts.TypeChecker, receiver: ts.Node, items: readonly CompletionItem[]): CompletionItem[] {
  const type = checker.getNonNullableType(checker.getTypeAtLocation(receiver));
  if (checker.typeToString(type) === 'any') return [...items];
  if (checker.isArrayType(type)) return items.filter((item) => LIST_MEMBERS.has(item.label));
  if (isText(checker, type)) return items.filter((item) => TEXT_MEMBERS.has(item.label));

  return items.filter((item) => {
    const property = checker.getPropertyOfType(type, item.label);
    if (property === undefined) return !callableKind(item);
    return !callable(checker, checker.getTypeOfSymbolAtLocation(property, receiver));
  });
}

/** A `string`, a string literal or a union of them. */
function isText(checker: ts.TypeChecker, type: ts.Type): boolean {
  const members = type.isUnion() ? type.types : [type];
  return members.every((member) => member.isStringLiteral() || checker.typeToString(member) === 'string');
}

/** A method or a function, and not a reactive value (§3.3). */
function callable(checker: ts.TypeChecker, type: ts.Type): boolean {
  const present = checker.getNonNullableType(type);
  return present.getCallSignatures().length > 0 && !isReactive(checker, present);
}

function callableKind(item: CompletionItem): boolean {
  return item.kind !== undefined && CALLABLE_KINDS.has(item.kind);
}

/**
 * A name declared where the caret is, by the band TypeScript sorts it in. An item with no band
 * comes from no program and cannot be placed: it is left to the other tests.
 */
function isLocal(item: CompletionItem): boolean {
  const band = item.sortText;
  if (band === undefined) return true;
  return LOCAL_BANDS.has(band.startsWith('z') ? band.slice(1) : band);
}

/** The type of every name in scope at a node. */
function scopeTypes(checker: ts.TypeChecker, at: ts.Node): ReadonlyMap<string, ts.Type> {
  const found = new Map<string, ts.Type>();
  for (const symbol of checker.getSymbolsInScope(at, ALL_MEANINGS)) {
    found.set(symbol.name, checker.getTypeOfSymbolAtLocation(symbol, at));
  }
  return found;
}

/** The innermost node covering an offset, or the file when none does (`forms.ts`). */
function nodeAt(source: ts.SourceFile, offset: number): ts.Node {
  let found: ts.Node = source;
  const visit = (node: ts.Node): void => {
    if (node.getStart(source) > offset || offset >= node.getEnd()) return;
    found = node;
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}
