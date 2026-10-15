/**
 * The messages of a view (SDD-58 §4.1–§4.3, §4.9, decisions 159–161).
 *
 * One walk over the tree finds what the view paints as text — phrases, translatable attributes,
 * literals in result position — and the `t()` calls of its JS. It is shared by the extraction
 * (`fudic translate`) and by the emit of a language's module, so the two can never disagree on
 * what a message is or what it is called: the emit looks a phrase up by the very node the
 * extraction keyed it on.
 *
 * Never throws: a node of a shape it does not expect is a node it does not translate.
 */

import { compileMessage, messageKey, shapeOf } from '@fudic/i18n';
import { FUD1020, FUD1025 } from '@fudic/diagnostics';
import type { RazorExpression } from '../at/index.js';
import type { Attribute, ElementNode, HtmlContent } from '../html/index.js';
import type { OxcNode } from '../oxc/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import { span as makeSpan } from '../types/index.js';
import { child, children, eachNode, stringLiteral, unwrap, type I18nName } from './ast.js';
import {
  LETTER,
  PHRASING,
  escapeIcu,
  normalizeSpace,
  translatableAttr,
  translateNo,
} from './vocabulary.js';

/** One translatable message found in a `.fud` or a `.ts` source. */
export interface Message {
  /** `messageKey(context, source)`. */
  readonly key: string;
  readonly context: string;
  /** ICU-escaped, holes as `{name}`, tags as `<n>…</n>`. */
  readonly source: string;
  readonly holes: readonly { readonly name: string; readonly expr: Span }[];
  /** Inline elements inside the message. */
  readonly tags: number;
  readonly origin: 'text' | 'attribute' | 'result' | 't';
  readonly span: Span;
  readonly at: number;
}

/** A phrase of the view: the run of inline content one message was made of. */
export interface Phrase {
  readonly message: Message;
  /** The run, as it stands in the tree. */
  readonly items: readonly HtmlContent[];
  /** Each `@expr` of the run → the hole it is. */
  readonly holeOf: ReadonlyMap<RazorExpression, string>;
  /** Each element of the run → its tag number. */
  readonly tagOf: ReadonlyMap<ElementNode, number>;
}

/** A translatable attribute: its message and the hole each `@expr` of its value is. */
export interface AttributeMessage {
  readonly message: Message;
  readonly holeOf: ReadonlyMap<RazorExpression, string>;
}

/** A string literal, or a fixed part of a template literal, in result position (§4.1). */
export interface ResultLiteral {
  readonly message: Message;
  /** The node: a `Literal` or a `TemplateElement`, in BUFFER coordinates. */
  readonly node: OxcNode;
  /** The text between the delimiters, in `.fud` coordinates. */
  readonly content: Span;
}

/** A `t("…")` call that yielded a message. */
export interface TCall {
  readonly message: Message;
  readonly call: OxcNode;
}

/** Everything the view says, and how to find it again. */
export interface ViewMessages {
  readonly messages: readonly Message[];
  readonly phrases: ReadonlyMap<HtmlContent, Phrase>;
  readonly attributes: ReadonlyMap<Attribute, AttributeMessage>;
  readonly literals: ReadonlyMap<OxcNode, ResultLiteral>;
  readonly calls: ReadonlyMap<OxcNode, TCall>;
  /** `t()` calls that cannot be extracted (FUD1020): an error of the code, like a type error. */
  readonly diagnostics: readonly Diagnostic[];
  /** Two `t()` of one text with different holes (FUD1025): what `fudic translate` reports. */
  readonly conflicts: readonly Diagnostic[];
}

/** What finding the `t()` calls of some JS needs. */
export interface CallSource {
  readonly context: string;
  /** Every JS AST of the file — view fragments and `@code` — where `t()` is looked for. */
  readonly scripts: readonly (OxcNode | readonly OxcNode[])[];
  /** Local name → the `@fudic/i18n` name it imports. */
  readonly imports: ReadonlyMap<string, I18nName>;
  /** A BUFFER span of an Oxc node → `.fud` coordinates. */
  mapSpan(start: number, end: number): Span;
}

/** What collecting needs of a document: its calls, plus its text, its roots and its view's JS. */
export interface MessageSource extends CallSource {
  readonly source: string;
  /** The markup to walk; `@code` is not markup. */
  readonly roots: readonly HtmlContent[];
  /** The AST of an expression of the view, by its span, or `undefined` when it has none. */
  astAt(at: Span): OxcNode | undefined;
}

/** A message before it has its ordinal. */
type Draft = Omit<Message, 'key' | 'at'>;

/** Collect the messages of a document. */
export function collectMessages(src: MessageSource): ViewMessages {
  return new Collector(src, src).run();
}

/** Collect the `t()` messages of some JS alone: a module, or the code of a document. */
export function collectCalls(src: CallSource): Pick<ViewMessages, 'messages' | 'calls' | 'diagnostics' | 'conflicts'> {
  const { messages, calls, diagnostics, conflicts } = new Collector(src).run();
  return { messages, calls, diagnostics, conflicts };
}

/** Collect the `t()` messages of plain JS (a `.ts`/`.js` module). */
export function collectScriptMessages(
  context: string,
  program: readonly OxcNode[],
  imports: ReadonlyMap<string, I18nName>,
): Pick<ViewMessages, 'messages' | 'calls' | 'diagnostics' | 'conflicts'> {
  return collectCalls({ context, scripts: [program], imports, mapSpan: (start, end) => makeSpan(start, end) });
}

class Collector {
  readonly #src: CallSource;
  /** The document, when there is one: its view is walked too. */
  readonly #view: MessageSource | undefined;
  readonly #drafts: { readonly draft: Draft; readonly assign: (m: Message) => void }[] = [];
  readonly #phrases = new Map<HtmlContent, Phrase>();
  readonly #attributes = new Map<Attribute, AttributeMessage>();
  readonly #literals = new Map<OxcNode, ResultLiteral>();
  readonly #calls = new Map<OxcNode, TCall>();
  readonly #diagnostics: Diagnostic[] = [];
  readonly #conflicts: Diagnostic[] = [];

  constructor(src: CallSource, view?: MessageSource) {
    this.#src = src;
    this.#view = view;
  }

  /** The document. Only the walk of the view asks, and it runs only when there is one. */
  get #doc(): MessageSource {
    return this.#view!;
  }

  run(): ViewMessages {
    if (this.#view !== undefined) this.#list(this.#view.roots);
    this.#tCalls();
    // Keys and ordinals, in source order: the same text twice in one context is one message,
    // and it keeps the ordinal of its first occurrence (§4.9).
    const ordered = this.#drafts.toSorted((a, b) => a.draft.span.start - b.draft.span.start);
    const ordinals = new Map<string, number>();
    const messages: Message[] = [];
    for (const { draft, assign } of ordered) {
      const key = messageKey(draft.context, draft.source);
      if (!ordinals.has(key)) ordinals.set(key, ordinals.size);
      const message: Message = { ...draft, key, at: ordinals.get(key)! };
      messages.push(message);
      assign(message);
    }
    return {
      messages,
      phrases: this.#phrases,
      attributes: this.#attributes,
      literals: this.#literals,
      calls: this.#calls,
      diagnostics: this.#diagnostics,
      conflicts: this.#conflicts,
    };
  }

  #draft(draft: Draft, assign: (m: Message) => void): void {
    this.#drafts.push({ draft, assign });
  }

  // ── The tree ──

  /** A list of content: runs of inline content are phrases, anything else is descended. */
  #list(nodes: readonly HtmlContent[]): void {
    let run: HtmlContent[] = [];
    for (const node of nodes) {
      if (isInline(node)) {
        run.push(node);
        continue;
      }
      this.#run(run);
      run = [];
      this.#node(node);
    }
    this.#run(run);
  }

  #node(node: HtmlContent): void {
    // The markup containers a list can hold: an element, a construct's branches, a section, a
    // snippet. Text, `@raw`, comments, `<style>`, `@{ }`, `@render` and the layout's markers
    // hold nothing to translate.
    const n = node as unknown as Record<string, unknown>;
    switch (node.type) {
      case 'element':
        if (translateNo(node) || node.kind === 'raw') return;
        this.#attributesOf(node);
        this.#list(node.children);
        return;
      case 'if':
        for (const branch of n['branches'] as readonly { readonly body: readonly HtmlContent[] }[]) this.#list(branch.body);
        if (n['elseBody'] !== undefined) this.#list(n['elseBody'] as readonly HtmlContent[]);
        return;
      case 'foreach':
      case 'for':
      case 'while':
        this.#list(n['body'] as readonly HtmlContent[]);
        return;
      case 'switch':
        for (const branch of n['cases'] as readonly { readonly body: readonly HtmlContent[] }[]) this.#list(branch.body);
        return;
      case 'section':
      case 'snippet':
        this.#list(n['children'] as readonly HtmlContent[]);
        return;
      default:
        return;
    }
  }

  /** A run of inline content: one phrase, a list of elements, or nothing to say. */
  #run(items: readonly HtmlContent[]): void {
    if (items.length === 0) return;
    // What every run owes regardless of being a phrase: the attributes of its elements and
    // the literals of what it paints.
    for (const item of items) this.#inside(item);
    this.#text(items);
  }

  /** The messages of a run's TEXT, once what is inside it has been said. */
  #text(items: readonly HtmlContent[]): void {
    if (!items.some(hasLetter)) return;
    // A run of elements separated by spaces — a nav, a bar of buttons — is not a phrase: one
    // message per element (§4.2).
    const bare = items.filter((i) => i.type !== 'text');
    if (bare.every((i) => i.type === 'element') && items.every((i) => i.type !== 'text' || i.value.trim() === '')) {
      for (const el of bare) this.#text((el as ElementNode).children);
      return;
    }
    this.#phrase(items);
  }

  /** The attributes and painted expressions inside a run, which a phrase does not carry. */
  #inside(item: HtmlContent): void {
    if (item.type === 'razor-expression') {
      this.#painted(item);
    } else if (item.type === 'element') {
      this.#attributesOf(item);
      for (const c of item.children) this.#inside(c);
    }
  }

  #phrase(items: readonly HtmlContent[]): void {
    const holes = new Holes(this.#doc);
    const tagOf = new Map<ElementNode, number>();
    const write = (list: readonly HtmlContent[]): string => {
      // Adjacent text is escaped as ONE string: the parser may split it (a stray `<` is a text
      // node of its own), and `<` + `1/>` escaped apart would read as a tag.
      let out = '';
      let text = '';
      const flush = (): void => {
        out += escapeIcu(text);
        text = '';
      };
      for (const item of list) {
        if (item.type === 'text') text += item.value;
        else if (item.type === 'razor-expression') {
          flush();
          out += `{${holes.name(item)}}`;
        } else if (item.type === 'element') {
          flush();
          const n = tagOf.size;
          tagOf.set(item, n);
          out += item.kind === 'void' ? `<${n}/>` : `<${n}>${write(item.children)}</${n}>`;
        } else text += '@'; // `@@`, the only other inline node
      }
      flush();
      return out;
    };
    const source = normalizeSpace(write(items));
    const first = items[0]!;
    const last = items.at(-1)!;
    const draft: Draft = {
      context: this.#src.context,
      source,
      holes: holes.list(),
      tags: tagOf.size,
      origin: 'text',
      span: trimmed(this.#doc.source, makeSpan(first.span.start, last.span.end)),
    };
    this.#draft(draft, (message) => {
      const phrase: Phrase = { message, items, holeOf: holes.of, tagOf };
      // Every item of the run finds its phrase: the emit meets the run item by item.
      for (const item of items) this.#phrases.set(item, phrase);
    });
  }

  #attributesOf(el: ElementNode): void {
    for (const attr of el.attributes) {
      if (!translatableAttr(el, attr)) continue;
      const parts = attr.value;
      for (const part of parts) if (part.type === 'razor-expression') this.#painted(part);
      if (!parts.some((p) => p.type === 'attribute-text' && LETTER.test(p.value))) continue;
      const holes = new Holes(this.#doc);
      const source = normalizeSpace(
        parts.map((p) => (p.type === 'attribute-text' ? escapeIcu(p.value) : `{${holes.name(p)}}`)).join(''),
      );
      const draft: Draft = {
        context: this.#src.context,
        source,
        holes: holes.list(),
        tags: 0,
        origin: 'attribute',
        span: trimmed(this.#doc.source, makeSpan(parts[0]!.span.start, parts.at(-1)!.span.end)),
      };
      this.#draft(draft, (message) => this.#attributes.set(attr, { message, holeOf: holes.of }));
    }
  }

  // ── Literals in result position (§4.1.3) ──

  #painted(expr: RazorExpression): void {
    const ast = this.#doc.astAt(expr.expr);
    if (ast !== undefined) this.#result(ast);
  }

  /** The value `node` paints: the whole of it, both arms, the right of `??`/`||`/`&&`. */
  #result(node: OxcNode): void {
    const value = unwrap(node);
    switch (value.type) {
      case 'Literal': {
        const text = stringLiteral(value);
        if (text !== undefined) this.#literal(value, text, value.start + 1, value.end - 1);
        return;
      }
      case 'TemplateLiteral':
        for (const quasi of children(value, 'quasis')) {
          const cooked = (quasi['value'] as { readonly cooked: string | null }).cooked ?? '';
          this.#literal(quasi, cooked, quasi.start + 1, quasi.end - (quasi['tail'] === true ? 1 : 2));
        }
        return;
      case 'ConditionalExpression':
        this.#result(child(value, 'consequent')!);
        this.#result(child(value, 'alternate')!);
        return;
      case 'LogicalExpression':
        this.#result(child(value, 'right')!);
        return;
      default:
        return;
    }
  }

  #literal(node: OxcNode, text: string, start: number, end: number): void {
    if (!LETTER.test(text)) return;
    const content = this.#src.mapSpan(start, end);
    const draft: Draft = {
      context: this.#src.context,
      source: normalizeSpace(escapeIcu(text)),
      holes: [],
      tags: 0,
      origin: 'result',
      span: content,
    };
    this.#draft(draft, (message) => this.#literals.set(node, { message, node, content }));
  }

  // ── `t()` (§4.3) ──

  #tCalls(): void {
    if (![...this.#src.imports.values()].includes('t')) return;
    /** Source → how many keys the first call with it named: two shapes of one text is FUD1025. */
    const shapes = new Map<string, number>();
    const calls: OxcNode[] = [];
    for (const script of this.#src.scripts) {
      eachNode(script, (node) => {
        if (node.type !== 'CallExpression') return;
        const callee = unwrap(child(node, 'callee')!);
        if (callee.type === 'Identifier' && this.#src.imports.get(String(callee['name'])) === 't') calls.push(node);
      });
    }
    // In SOURCE order: the view's fragments come before `@code` in the batch, and «the second»
    // of FUD1025 is the second the author wrote.
    const start = (n: OxcNode): number => this.#src.mapSpan(n.start, n.end).start;
    for (const call of calls.toSorted((a, b) => start(a) - start(b))) this.#tCall(call, shapes);
  }

  #tCall(call: OxcNode, shapes: Map<string, number>): void {
    const [first, second] = children(call, 'arguments');
    const map = (n: OxcNode): Span => this.#src.mapSpan(n.start, n.end);
    const text = first === undefined ? undefined : stringLiteral(first);
    if (first === undefined || text === undefined) {
      this.#diagnostics.push(FUD1020({ span: map(first ?? call), problem: 'not-literal' }));
      return;
    }
    const { holes } = shapeOf(compileMessage(text, '').value);
    const object = second !== undefined && second.type === 'ObjectExpression' ? second : undefined;
    const given = new Map<string, OxcNode>();
    for (const property of object === undefined ? [] : children(object, 'properties')) {
      const key = property.type === 'Property' && property['computed'] !== true ? child(property, 'key') : undefined;
      const name = key === undefined ? undefined : key.type === 'Identifier' ? String(key['name']) : stringLiteral(key);
      if (name !== undefined) given.set(name, child(property, 'value')!);
    }
    const missing = holes.filter((h) => !given.has(h));
    if (missing.length > 0) {
      this.#diagnostics.push(FUD1020({ span: map(second ?? first), problem: 'holes', missing }));
    }
    // Only calls that are right on their own are compared: a missing hole is FUD1020's to say.
    const before = missing.length > 0 ? undefined : shapes.get(text);
    if (before !== undefined && before !== given.size) this.#conflicts.push(FUD1025({ span: map(call) }));
    if (missing.length === 0 && before === undefined) shapes.set(text, given.size);

    const draft: Draft = {
      context: this.#src.context,
      source: text,
      holes: holes.flatMap((name) => {
        const value = given.get(name);
        return value === undefined ? [] : [{ name, expr: map(value) }];
      }),
      tags: 0,
      origin: 't',
      span: map(call),
    };
    this.#draft(draft, (message) => this.#calls.set(call, { message, call }));
  }
}

/** The holes of one message: a name per expression, reused when the expression repeats. */
class Holes {
  readonly of = new Map<RazorExpression, string>();
  readonly #byText = new Map<string, string>();
  readonly #spans = new Map<string, Span>();
  #args = 0;

  constructor(private readonly src: MessageSource) {}

  name(expr: RazorExpression): string {
    const text = this.src.source.slice(expr.expr.start, expr.expr.end).trim();
    let name = this.#byText.get(text);
    if (name === undefined) {
      const ast = this.src.astAt(expr.expr);
      const base = (ast === undefined ? undefined : holeName(ast)) ?? `arg${++this.#args}`;
      name = base;
      for (let k = 2; this.#spans.has(name); k++) name = `${base}${k}`;
      this.#byText.set(text, name);
      this.#spans.set(name, expr.expr);
    }
    this.of.set(expr, name);
    return name;
  }

  list(): readonly { readonly name: string; readonly expr: Span }[] {
    return [...this.#spans].map(([name, expr]) => ({ name, expr }));
  }
}

/**
 * The name a hole takes from its expression (§4.2): the last segment of a path, a signal read
 * without its `()`, a pipe the name of its value. `undefined` for anything else: `argN`.
 */
export function holeName(node: OxcNode): string | undefined {
  const value = unwrap(node);
  switch (value.type) {
    case 'Identifier':
      return String(value['name']);
    case 'MemberExpression': {
      const property = child(value, 'property')!;
      return value['computed'] !== true && property.type === 'Identifier' ? String(property['name']) : undefined;
    }
    case 'CallExpression': {
      const callee = unwrap(child(value, 'callee')!);
      const path = callee.type === 'Identifier' || callee.type === 'MemberExpression';
      return path && children(value, 'arguments').length === 0 ? holeName(callee) : undefined;
    }
    case 'BinaryExpression':
      return value['operator'] === '|' ? holeName(child(value, 'left')!) : undefined;
    default:
      return undefined;
  }
}

/** Inline content: text, `@expr`, `@@`, and a phrasing element of inline content. */
export function isInline(node: HtmlContent): boolean {
  switch (node.type) {
    case 'text':
    case 'razor-expression':
    case 'at-escape':
      return true;
    case 'element':
      return PHRASING.has(node.name.toLowerCase()) && !translateNo(node) && node.children.every(isInline);
    default:
      return false;
  }
}

function hasLetter(node: HtmlContent): boolean {
  if (node.type === 'text') return LETTER.test(node.value);
  return node.type === 'element' && node.children.some(hasLetter);
}

/** `at` without the whitespace at its two ends. */
function trimmed(source: string, at: Span): Span {
  const text = source.slice(at.start, at.end);
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  return makeSpan(at.start + lead, Math.max(at.start + lead, at.end - trail));
}
