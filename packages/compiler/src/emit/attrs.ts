/**
 * Attribute codegen, shared by the server branch (`markup.ts`) and the client branch
 * (`markup-client.ts`).
 *
 * It lives in its own module for one reason: the two branches MUST agree byte for byte on
 * what an attribute becomes. The `h` path adopts the markup the server painted, so a
 * `class` composed in a different order, or a boolean attribute omitted on one side and
 * written on the other, is not a cosmetic difference — it is a component that hydrates
 * against a tree it does not recognise. Two copies of this logic would drift; one cannot.
 */

import {
  decodeEntities,
  type ElementNode,
  type Attribute,
  type AttributeText,
  type AttributeValuePart,
} from '../html/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Span } from '../types/index.js';
import {
  classifyAttribute,
  crossing,
  CONTROL_PROP,
  isSummaryFields,
  spreadExpr,
  type Binding,
  type ComponentDeclaredProps,
} from '../binding/index.js';
import { classTokens } from '@fudic/dom';
import { here, type CodeWriter } from './writer.js';
import type { AssetLinker } from './assets.js';
import { freeReferences, type FragmentAst } from './scope.js';

/**
 * A single-URL asset attribute the linker rewrites: `src`/`poster` on any element, or
 * `href` on a `<link>` (stylesheet/icon) — never `<a href>`, which is navigation.
 */
export const isAssetAttr = (element: string, attribute: string): boolean =>
  attribute === 'src' || attribute === 'poster' || (attribute === 'href' && element === 'link');

/**
 * The characters a literal attribute run contributes. Same rule as a text run (BUG-14 §3.2):
 * what `setAttr` receives is the VALUE, not markup, so the entities of the source are decoded
 * here and re-encoded by whoever writes it out — `escapeAttr` on the server, nothing at all on
 * the client, where an attribute is set through the DOM and never through a parser. `@@` is
 * already a bare `@` by now: the parser resolves it in value position.
 */
const attrText = (part: AttributeText): string => decodeEntities(part.value);

/**
 * JS expression for an attribute's value. Three shapes, in order: all literal → a string;
 * one lone `@expr` → the expression itself, UNSTRINGIFIED, so a boolean or a number keeps
 * its type (that is what lets decision 21 omit a falsy boolean attribute); anything mixed →
 * ONE template literal, `?? ''` per hole.
 *
 * The mixed shape is the same answer `runs.ts` gives to the same question in text, and it is
 * the same answer for the same reason: `href="/customer/@id"` is one value the author wrote
 * as one string, so it goes out as one string. The `?? ''` is what keeps a missing value from
 * spelling itself into it — `/customer/undefined` is a URL, and a wrong one, where
 * `/customer/` is at least visibly incomplete. The lone `@expr` shape does NOT get it: there
 * the nullish value is the signal decision 21 reads to omit the attribute altogether.
 *
 * There is no escaping here and there must not be: what `setAttr` receives is the VALUE.
 * The server re-encodes it when it serializes (`escapeAttr`), and on the client an attribute
 * is set through the DOM and never through a parser.
 */
export function attrExpr(source: string, attr: Attribute): string {
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);
  const parts = attr.value;
  const texts = parts.filter((p): p is AttributeText => p.type === 'attribute-text');
  if (texts.length === parts.length) return JSON.stringify(texts.map(attrText).join(''));
  // Not all literal, and a single part: that part is the expression.
  if (parts.length === 1) return `(${slice((parts[0] as RazorExpression).expr)})`;
  const template = parts
    .map((p) =>
      p.type === 'attribute-text'
        ? attrText(p).replace(/[`\\$]/gu, '\\$&')
        : '${(' + slice(p.expr) + ") ?? ''}",
    )
    .join('');
  return '`' + template + '`';
}

/** The live properties of a control, by element (SDD-74 §4.4): what the user moves and the view writes back. */
const LIVE_PROPS: Readonly<Record<string, readonly string[]>> = {
  input: ['checked', 'value'],
  textarea: ['value'],
  select: ['value'],
  option: ['selected'],
};

/** Whether `attribute` of an `<element>` is a live property the browser writes as one. */
export const isLiveProp = (element: string, attribute: string): boolean =>
  LIVE_PROPS[element.toLowerCase()]?.includes(attribute.toLowerCase()) === true;

/**
 * The attributes a browser navigates to or loads from (SDD-51 §3.7, decision 140). `data` is
 * one only on an `<object>`; everywhere else it is a plain attribute.
 */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'xlink:href',
  'srcset',
  'imagesrcset',
  'ping',
]);

export function isUrlAttr(element: string, attribute: string): boolean {
  const name = attribute.toLowerCase();
  return URL_ATTRIBUTES.has(name) || (name === 'data' && element.toLowerCase() === 'object');
}

/** The URL attributes that hold a LIST: a prefix speaks for the first URL only. */
const LIST_ATTRIBUTES: ReadonlySet<string> = new Set(['srcset', 'imagesrcset', 'ping']);

/** The schemes a literal prefix may pin: the guard's own list (`@fudic/dom`). */
const PINNED_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * Whether an interpolated URL attribute is written through the guard (`$dom.setUrl`) rather
 * than `setAttr`: when what the author wrote literally at its start does not pin the origin.
 *
 * The prefix is the literal text of the value parts (decision 20) up to the first expression,
 * plus the first chunk of that expression when it is one template literal and nothing else —
 * `` href=@(`/posts/${id}`) `` is the same value as `href="/posts/@id"`. It pins the origin when
 * it opens with `/` and something that is neither `/` nor `\`, with `./`, `../`, `#` or `?`, or
 * with a scheme the guard would let through anyway. Anything else — `@url`, `` `${base}/x` ``,
 * `` `/${x}` ``, whose `x` could be `/evil.example` — is guarded.
 *
 * A `srcset`, an `imagesrcset` and a `ping` are lists, and a prefix only says something about
 * the first URL: they are always guarded, and the guard reads every one.
 */
export function guardsUrl(
  source: string,
  element: string,
  attribute: string,
  value: readonly AttributeValuePart[],
): boolean {
  if (!isUrlAttr(element, attribute)) return false;
  if (LIST_ATTRIBUTES.has(attribute.toLowerCase())) return true;
  return !pinsOrigin(fixedPrefix(source, value), element, attribute);
}

function fixedPrefix(source: string, value: readonly AttributeValuePart[]): string {
  let prefix = '';
  for (const part of value) {
    if (part.type === 'attribute-text') {
      prefix += attrText(part);
      continue;
    }
    return prefix + templateHead(source.slice(part.expr.start, part.expr.end).trim());
  }
  return prefix;
}

/**
 * The text before the first `${` of an expression that is ONE template literal, or `''`.
 *
 * Read off the text and conservative by construction: exactly two backticks, one at each end,
 * is one template and nothing around it — `` `/p/`.replace(…) `` or `` `/a` + x `` would put a
 * third one in or leave one off the end. A backslash ends the head where it stands, so an
 * escape never has to be decoded. Whatever this cannot read is no prefix, and is guarded.
 */
function templateHead(expr: string): string {
  if (!expr.startsWith('`') || !expr.endsWith('`') || expr.split('`').length !== 3) return '';
  let head = '';
  for (let i = 1; i < expr.length - 1; i++) {
    const char = expr[i]!;
    if (char === '\\' || (char === '$' && expr[i + 1] === '{')) break;
    head += char;
  }
  return head;
}

function pinsOrigin(prefix: string, element: string, attribute: string): boolean {
  // What a browser drops before it reads a URL: tabs and line breaks anywhere. Leading spaces
  // or control characters are dropped too, and then the literal no longer says where it goes.
  const text = prefix.replace(/[\t\n\r]/gu, '');
  if (/^[\x00-\x20]/u.test(text)) return false;
  if (text.startsWith('./') || text.startsWith('../') || text.startsWith('#') || text.startsWith('?')) {
    return true;
  }
  if (text.length >= 2 && text[0] === '/' && text[1] !== '/' && text[1] !== '\\') return true;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(text)?.[1]?.toLowerCase();
  if (scheme === undefined) return false;
  if (PINNED_SCHEMES.has(scheme)) return true;
  return (
    scheme === 'data' &&
    element.toLowerCase() === 'img' &&
    attribute.toLowerCase() === 'src' &&
    text.slice('data:'.length).toLowerCase().startsWith('image/')
  );
}

/**
 * What the emitters need to know ABOUT the element they are writing attributes for, beyond
 * the node itself.
 *
 * Two facts, and both are about the host rather than the attribute, which is why they
 * travel together instead of as two more positional arguments.
 */
export interface HostContext {
  /** A component tag (decision 41): what decides whether a `.prop` is an attribute at all. */
  readonly isComponent: boolean;
  /** The names this component declares with `signal(...)`. See `crossingExpr`. */
  readonly signals: ReadonlySet<string>;
  /** What the child declares about one of its props, or `undefined` when it cannot be read. */
  readonly declared?: PropTarget;
}

/**
 * What the CHILD of this host declares about the prop a value is landing on — and, as `all`,
 * every prop it declares, in order: what a spread expands against (props-spec decision 147).
 */
export type PropTarget = ((name: string) => ComponentDeclaredProps | undefined) & {
  readonly all: readonly ComponentDeclaredProps[];
};

/** A host with nothing declared around it — a page body, a template with no `@client`. */
export const NO_SIGNALS: HostContext = { isComponent: false, signals: new Set() };

/** The declared props of a tag, as the lookup `HostContext` and `componentPropsExpr` take. */
export function propTarget(declared: readonly ComponentDeclaredProps[]): PropTarget {
  return Object.assign((name: string) => declared.find((d) => d.name === name), { all: declared });
}

/**
 * The props a `...item` hands the child, by name, each read off `item` (decisions 146–149).
 *
 * Against the CHILD's keys, never `item`'s: what `item` carries beyond them does not cross
 * (80). A key the host also writes as a `.prop` is the host's, wherever the spread sits — the
 * explicit binding is the more specific statement. A spread whose child cannot be read
 * expands to nothing: with no `T` there is no key to expand against.
 *
 * Two spreads on one host: the later one wins a key it HAS, as in JS. «Has» is read as «not
 * `undefined`», which is what the child's destructuring reads it as too — an `undefined` there
 * is a missing prop and takes the default either way.
 */
export function spreadProps(
  source: string,
  el: ElementNode,
  declared: PropTarget | undefined,
): readonly { readonly name: string; readonly expr: string }[] {
  if (declared === undefined) return [];
  const explicit = new Set<string>();
  const objects: string[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'property') explicit.add(b.name);
    else if (b.type === 'control') explicit.add(CONTROL_PROP);
    else if (b.type === 'spread' && b.expr !== null) objects.push(source.slice(b.expr.start, b.expr.end));
  }
  if (objects.length === 0) return [];
  return declared.all
    .filter((prop) => !explicit.has(prop.name))
    .map((prop) => ({
      name: prop.name,
      expr: objects.reduce<string>((earlier, object, i) => {
        const read = `(${object}).${prop.name}`;
        return i === 0 ? read : `(${read} !== undefined ? ${read} : ${earlier})`;
      }, ''),
    }));
}

/**
 * The WEAKER question, and the one that decides whether anything downstream can move at
 * all: does this value READ a name whose value can change?
 *
 * `crossing` asks whether the value IS a bare reactive, and that answer is what buys a
 * subscription of its own (BUG-18 §4.1). It is too narrow to decide the other two things a
 * value determines — whether the child is hydratable at all (`level.ts`) and whether the
 * parent has to hand it over again (`markup-client.ts#childValues`) — because
 * `.value="@(count() + 1)"` moves exactly as much as `.value="@count"` and is not a name.
 *
 * ONE definition for both readers, and that is not tidiness: they were two, they disagreed,
 * and the disagreement was a `TypeError` in the browser. The emit pushed a new value into a
 * host that the level rule had decided was level 1, so the tag was never defined and the
 * element had no `u` to call. Whatever answers yes here has to be hydratable there.
 *
 * By FREE references and not by text: a name a lambda inside the expression declares itself
 * is not the component's, and `@(xs.map((count) => count))` reads nothing that moves.
 */
export function readsMoving(
  value: readonly AttributeValuePart[],
  ast: (at: Span) => FragmentAst,
  moving: ReadonlySet<string>,
): boolean {
  const fragments: FragmentAst[] = [];
  for (const part of value) {
    if (part.type === 'razor-expression') fragments.push(ast(part.expr));
  }
  if (fragments.length === 0) return false;
  return freeReferences(fragments).some((name) => moving.has(name));
}

/**
 * Whether a text reads a MEMBER of one of `names`: `userForm.$issues()`, `store?.count()`. An
 * imported form or store is no source itself — its members are — so this is how a read through
 * it is told apart (BUG-42 §4.3). One pattern for every reader: the pass that subscribes such a
 * read, the hand-over of a child that is given one, and the level rule that makes that child
 * hydrate, which have to agree for the reason `readsMoving` gives.
 */
export function readsMember(text: string, names: Iterable<string>): boolean {
  for (const name of names) {
    if (new RegExp(`(?<![\\w$.])${name.replace(/\$/gu, '\\$')}\\s*\\??\\.`, 'u').test(text)) return true;
  }
  return false;
}

/** The same question of an attribute value: does one of its expressions read through `names`? */
export function valueReadsMember(value: readonly AttributeValuePart[], source: string, names: Iterable<string>): boolean {
  const list = [...names];
  return value.some((part) => part.type === 'razor-expression' && readsMember(source.slice(part.expr.start, part.expr.end), list));
}

/**
 * The same question for the `...object`s of a host: every prop a spread hands over is read off
 * its object, so the props move exactly when the object reads something that does (decision
 * 148). The level rule and the client emit both ask it here, for the reason `readsMoving` gives.
 */
export function spreadReadsMoving(
  el: ElementNode,
  ast: (at: Span) => FragmentAst,
  moving: ReadonlySet<string>,
): boolean {
  const fragments = el.attributes.flatMap((attr) => {
    const at = spreadExpr(attr);
    return at === null ? [] : [ast(at)];
  });
  return fragments.length > 0 && freeReferences(fragments).some((name) => moving.has(name));
}

/**
 * The expression a value crosses the shadow boundary with.
 *
 * Decision 151: a VALUE crosses, never the signal object. So a value whose text is exactly
 * the name of a `signal(...)` this component declares crosses as `name()` — otherwise
 * the server would paint `[object Object]` and the client would hand the child a live
 * object it cannot serialize (SDD-17). Anything else crosses as written.
 *
 * The call form is the only read since SDD-31 §4.0, and it costs nothing here: this
 * expression is evaluated by `$s`/`$a`, outside any effect, so it tracks nobody.
 *
 * The rule itself is `crossing`'s (`binding/crossing.ts`) and not this module's, because the
 * projection has to apply exactly the same one: the editor was type-checking the signal
 * object while the build crossed its value (BUG-23 §2.8). Here it is only spelled out as an
 * expression.
 *
 * With a `target` the answer may be `'ref'` (props-spec decision 153), and then what crosses is
 * the BARE name: the object itself, because that is what the child declared. Without one it is
 * always `'value'` — which is what an ATTRIBUTE always passes, whatever the child declares,
 * since level 1 is HTML and HTML carries strings (BUG-24 §4.7).
 */
export function crossingExpr(
  source: string,
  attr: Attribute,
  value: readonly AttributeValuePart[],
  signals: ReadonlySet<string>,
  target?: ComponentDeclaredProps,
): string {
  const crossed = crossing(source, value, signals, target);
  if (crossed === undefined) return attrExpr(source, attr);
  return crossed.kind === 'ref' ? crossed.name : `${crossed.name}()`;
}

/**
 * What a binding writes as an ATTRIBUTE of its element — its name and value parts — or
 * `null` when it writes none. The one place the rule lives, because the two branches must
 * agree about it byte for byte.
 *
 * In fudic a property is written with a dot and an attribute is written plain, and BUG-32
 * makes that the whole of it: ONLY a plain attribute becomes one. A `.prop` never does, on a
 * component as much as on a native tag — it reaches the child by `render` on the server and
 * by the cell on the client, and reflecting it on the host besides was a second copy of the
 * same value that nobody read and that `$a()` rewrote on every update.
 *
 * Reflecting a prop is still available and is now the author's own decision, spelled as what
 * it is: a plain attribute with an expression, `data-x="@value"`, which lands here by the
 * line above and is kept in sync by the same pass.
 */
function attributeOf(
  b: Binding,
): { readonly name: string; readonly value: readonly AttributeValuePart[] } | null {
  return b.type === 'attr' ? b : null;
}

/**
 * Whether the component's own host wrapper carries anything the two branches have to write
 * (BUG-32 T2). Asked before a single line is emitted for it, because `$host` is materialized
 * only where something reads it (§4.4) and an identity tag with no binding — which is nearly
 * all of them — must keep the exact bytes it had.
 *
 * `class` is in the list and `class:` is not: a static `class="panel"` on the host is an
 * attribute like any other, while a `class:` binding there resolves against the page rather
 * than against this file's `<style>` and is an error the semantic pass reports.
 */
export function hasHostBindings(source: string, el: ElementNode): boolean {
  return el.attributes.some((attr) => {
    const b = classifyAttribute(attr, source).value;
    return b.type === 'attr' || b.type === 'event' || b.type === 'bus';
  });
}

/**
 * The same question for the SERVER, which has no hookup: an `@event` on the host is the
 * client branch's alone, so a host carrying nothing but listeners must not make this side
 * declare a `$host` that no line below would read.
 */
export function hasHostAttrs(source: string, el: ElementNode): boolean {
  return el.attributes.some((attr) => classifyAttribute(attr, source).value.type === 'attr');
}

/**
 * The props object literal a component host is rendered/created with: its `.prop` bindings,
 * and only those.
 *
 * A plain attribute is NOT in here (BUG-16 §4.2). It is HTML's own vocabulary — `id`,
 * `class`, `slot`, `data-*` — and handing it to the child's `render` made a component
 * declare props for things that were never its own.
 */
export function componentPropsExpr(
  source: string,
  el: ElementNode,
  signals: ReadonlySet<string>,
  declared?: PropTarget,
): string {
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);
  // `...item` first: `spreadProps` already left out every key an explicit binding writes.
  const entries: string[] = spreadProps(source, el, declared).map((p) => `${JSON.stringify(p.name)}: ${p.expr}`);
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    // `control="@f.body"` on a component tag hands the child the NODE (decision 112). On the
    // server there is no cable — the child's `render` is a call in this same process — so the
    // object goes straight in, which is what lets SSR paint the child's values.
    if (b.type === 'control') {
      entries.push(`${JSON.stringify(CONTROL_PROP)}: ${slice(b.value.expr)}`);
      continue;
    }
    if (b.type !== 'property') continue;
    // A bare `.disabled` is `true` (decision 44), which is what the projection checks it
    // as; `attrExpr` would give the `""` an attribute wants and a prop does not.
    //
    // Here — and only here — the child's own declaration decides the form: in the server
    // there is no cable, the child's `render` is a call in this same process, so a prop that
    // asked for a `Signal<T>` receives the object and reads it itself (BUG-24 §4.7).
    const expr =
      b.value.length === 0
        ? 'true'
        : crossingExpr(source, attr, b.value, signals, declared?.(b.name));
    entries.push(`${JSON.stringify(b.name)}: ${expr}`);
  }
  return `{ ${entries.join(', ')} }`;
}

/**
 * Where the writes of one element land. Two methods and not one because the two branches
 * disagree about what a value costs: the server body runs once, so it can drop the
 * expression straight into the statement, while `$a()` runs again on every update and has
 * to hold on to what it last wrote (BUG-12 §4.2).
 *
 * `once` is a write whose statement reads the value a single time — the sink may inline
 * the expression. `bound` reads it several times, so it MUST be bound to a name first.
 */
export interface ValueSink {
  /**
   * Whether the statements this sink emits run more than once. A write that can happen
   * again is a write that can have to be taken back: only then does an attribute that
   * turned falsy need removing.
   */
  readonly repeats: boolean;
  once(expr: string, write: (value: string) => string): void;
  bound(expr: string, write: (value: string) => string): void;
  /**
   * A write that needs what it wrote LAST as well as the value — a native spread, which has to
   * take off the attributes its objects no longer write, and `class=@expr`, which takes off the
   * tokens its value no longer has. `prev` is `undefined` the first time.
   *
   * `rewrites` is how many of the value writes that come RIGHT AFTER this one have to run again
   * whenever this one does: the `class:` toggles of the same element, so a token the swap took
   * off goes back on when its toggle says so (SDD-85 §4.5, rule 5). A sink that writes once
   * already runs them after it, and ignores it.
   */
  diff(expr: string, write: (value: string, prev: string) => string, rewrites?: number): void;
  /**
   * A write that runs on every pass, never filtered by what it wrote last: a live property of a
   * control (SDD-74 §4.4), which compares with the DOM instead. Only a sink that repeats has one.
   * `initial` is what a control the browser creates gets once, before: its default, as the server
   * paints it (SDD-85 §4.2).
   */
  live?(expr: string, write: (value: string) => string, initial: (value: string) => string): void;
}

/**
 * Where a LITERAL attribute goes instead of its `setAttr` line: its name and its value — the
 * client's template carries it (SDD-85 §4.1).
 */
export type LiteralSink = (name: string, value: string) => void;

/** The single-body sink: the server. */
export function inlineSink(w: CodeWriter): ValueSink {
  return {
    repeats: false,
    once: (expr, write) => {
      w.line(write(expr));
    },
    bound: (expr, write) => {
      w.line(`{ const $v = ${expr}; ${write('$v')} }`);
    },
    diff: (expr, write) => {
      w.line(write(expr, 'undefined'));
    },
  };
}

/**
 * Write the statements for one element's attributes.
 *
 * The class list is written token by token (SDD-85 §4.5): a static `class="a b"` is a literal
 * like any other attribute, minus the tokens a `class:` of the element owns (rule 1); then
 * `class=@expr` swaps its tokens (`swapClass`) and each `class:x=@cond` toggles its own
 * (`toggleClass`), in that order and in source order (rule 2). None of them writes the whole
 * attribute, so a class some other code added survives every change.
 *
 * `fixed` takes what is known at build time; `values` takes what depends on an expression.
 * They are the same writer on the server and two different bodies on the client, which is
 * the whole reason this module is shared: the two branches must agree byte for byte on
 * what an attribute becomes, and one of them now writes it twice.
 *
 * `host.isComponent` decides one thing only, and `attributeOf` owns it: whether a `.prop` is
 * an attribute of this element. Event / bus / ref bindings are never written here — they are
 * hookup, which belongs in the controller's `$s()`, and they are absent from SSR entirely.
 */
export function writeElementAttrs(
  source: string,
  el: ElementNode,
  v: string,
  fixed: CodeWriter,
  linker: AssetLinker,
  host: HostContext,
  values: ValueSink = inlineSink(fixed),
  literals?: LiteralSink,
): void {
  // A literal attribute: its `setAttr` line, or — for the client, whose template carries it
  // (SDD-85 §4.1) — the sink that takes it instead.
  const literal = (name: string, value: string, line: string): void => {
    if (literals === undefined) fixed.mappedLine(here(el.openSpan.start), line);
    else literals(name, value);
  };
  const toggles = classToggles(source, el, host);
  const toggled = new Set(toggles.map((t) => t.token));
  // The toggles go right behind the swap when there is one, and at the end when there is none.
  const writeToggles = (): void => {
    for (const { token, condition } of toggles) {
      values.once(`!!(${condition})`, ($v) => `$dom.toggleClass(${v}, ${JSON.stringify(token)}, ${$v});`);
    }
  };
  let swapped = false;
  let spread = false;
  for (const attr of el.attributes) {
    // The `fields` of a summary is the compiler's, and it never reaches the HTML (decision 131).
    if (isSummaryFields(el, attr)) continue;
    const b = classifyAttribute(attr, source).value;
    // The spreads of a native element are written together, where the FIRST of them sits
    // (SDD-61 §3.8): the explicit attributes keep their places around them.
    if (b.type === 'spread' && !host.isComponent) {
      if (!spread) writeSpreadAttrs(source, el, v, values);
      spread = true;
      continue;
    }
    const written = attributeOf(b);
    if (written === null) continue; // event / bus / ref, and `.prop` on a native tag
    const isStatic = written.value.every((p) => p.type === 'attribute-text');
    if (isStatic) {
      const text = written.value.map((p) => attrText(p as AttributeText)).join('');
      if (written.name === 'class') {
        // In its place, like any other literal; what is left once the toggled tokens are out.
        const kept = staticClass(text, toggled);
        if (kept !== null) literal('class', kept, `$dom.setAttr(${v}, 'class', ${JSON.stringify(kept)});`);
        continue;
      }
      const name = JSON.stringify(written.name);
      // A static, relative asset URL: reference the import Vite resolves (SDD-19 §4.5); a
      // missing/absolute one stays a literal (`maybeRef` → null, missing → FUD0363). The
      // reference is a value of the module, not text: it is never a literal of a template.
      const binding = linker.enabled && isAssetAttr(el.name, written.name) ? linker.maybeRef(text) : null;
      if (binding !== null) fixed.mappedLine(here(el.openSpan.start), `$dom.setAttr(${v}, ${name}, ${binding});`);
      else literal(written.name, text, `$dom.setAttr(${v}, ${name}, ${JSON.stringify(text)});`);
    } else if (written.name === 'class') {
      // `class=@expr`, and a `class="card @(x)"` that mixes in a literal: one value, written
      // by tokens, in its place — where the server always wrote it. Its value goes over as it
      // is: `swapClass` reads a string or a number as its text and anything else as no token,
      // which is decision 21's omitted falsy attribute said of a class list.
      //
      // The toggles right behind it, so a token both write ends up as its toggle says
      // (rule 5): on every pass where the swap runs, the toggles run again.
      const swap = crossingExpr(source, attr, written.value, host.signals);
      values.diff(swap, ($v, prev) => `$dom.swapClass(${v}, ${$v}, ${prev});`, toggles.length);
      writeToggles();
      swapped = true;
    } else {
      // interpolated: omit when falsy (boolean attributes, decision 21), else set. A sink
      // that repeats also has to CLEAR it: a value that turned falsy on an update would
      // otherwise leave the attribute the previous value put there.
      const name = JSON.stringify(written.name);
      // A live property of a control: the browser writes the property, compared with the DOM on
      // every pass, so what the user moved goes back to what the view says (SDD-74 §4.4).
      // Where the writes do not repeat — the server — it is
      // the same call once: the server writes what says it without a script (a `<textarea>`'s
      // text, the `selected` of an `<option>`), the browser the property.
      if (isLiveProp(el.name, written.name)) {
        const expr = crossingExpr(source, attr, written.value, host.signals);
        const write = ($v: string): string => `$dom.setLive(${v}, ${name}, ${$v});`;
        const initial = ($v: string): string => `$dom.setDefault(${v}, ${name}, ${$v});`;
        if (values.live !== undefined) values.live(expr, write, initial);
        else values.bound(expr, write);
        continue;
      }
      const clear = values.repeats ? ` else $dom.removeAttr(${v}, ${name});` : '';
      // A URL whose prefix does not pin the origin goes through the guard (SDD-51 §3.7), and
      // goes UNSTRINGIFIED: a `trustedUrl(…)` is told apart by what it is, not by its text.
      const write = guardsUrl(source, el.name, written.name, written.value)
        ? ($v: string): string => `$dom.setUrl(${v}, ${name}, ${$v})`
        : ($v: string): string => `$dom.setAttr(${v}, ${name}, String(${$v}))`;
      values.bound(
        crossingExpr(source, attr, written.value, host.signals),
        ($v) =>
          `if (${$v} === true) $dom.setAttr(${v}, ${name}, ''); ` +
          `else if (${$v} !== false && ${$v} != null) ${write($v)};${clear}`,
      );
    }
  }
  // With no swap, the toggles go last: after every literal, the static class included (rule 2).
  if (!swapped) writeToggles();
}

/**
 * The element's `class:` bindings, in source order: the token each one owns — the ones a static
 * `class` gives up (rule 1) — and its condition.
 *
 * Through `crossingExpr` like every other value, and that is BUG-32 T4: composing this from the
 * raw source text made a `class:red="@rojo"` test the signal OBJECT, which is always truthy — the
 * class went on at the first render and `rojo.set(false)` never took it off. Decision 151 applies
 * here as much as to an attribute; the fallback for anything that is not a bare reactive is the
 * very text this used to slice.
 */
function classToggles(
  source: string,
  el: ElementNode,
  host: HostContext,
): readonly { readonly token: string; readonly condition: string }[] {
  const toggles: { readonly token: string; readonly condition: string }[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'class') {
      toggles.push({ token: b.className, condition: crossingExpr(source, attr, [b.value], host.signals) });
    }
  }
  return toggles;
}

/**
 * What a static `class` writes once the tokens a `class:` owns are out (SDD-85 §4.5, rule 1):
 * the literal as written when it gives up none — `class=""` included — the tokens left when it
 * gives up some, and `null`, nothing to write, when it gives up all of them.
 */
export function staticClass(literal: string, toggled: ReadonlySet<string>): string | null {
  const tokens = classTokens(literal);
  const kept = tokens.filter((token) => !toggled.has(token));
  if (kept.length === tokens.length) return literal;
  return kept.length === 0 ? null : kept.join(' ');
}

/**
 * `<input ...resto>`: the spreads of a NATIVE element, as one write of all their objects in
 * order (`$dom.setAttrs`), which writes the attributes sorted by name. On a component the same
 * `...` hands props over and never reaches here as attributes. What the element writes
 * explicitly — a plain attribute, or the `class` it
 * writes by any of its three forms — is left out of the spread wherever it sits, as an explicit `.prop` wins
 * over a props spread.
 */
function writeSpreadAttrs(source: string, el: ElementNode, v: string, values: ValueSink): void {
  const objects: string[] = [];
  const except = new Set<string>();
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'attr') except.add(b.name);
    else if (b.type === 'class') except.add('class');
    else if (b.type === 'spread' && b.expr !== null) objects.push(`(${source.slice(b.expr.start, b.expr.end)})`);
  }
  if (objects.length === 0) return;
  const names = JSON.stringify([...except]);
  const value = `[${objects.join(', ')}]`;
  // In the browser the static attributes come with the clone and the spread's go behind them,
  // written by `$a` (SDD-85 §4.6): the order of attributes is not something the DOM shows.
  values.diff(value, ($v, prev) => `$dom.setAttrs(${v}, ${$v}, ${prev}, ${names});`);
}
