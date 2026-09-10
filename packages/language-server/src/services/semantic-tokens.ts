/**
 * Semantic tokens from the real AST (SDD-24 §4.3).
 *
 * They exist to correct the TextMate grammar of SDD-25, which is necessarily approximate at the
 * `@` transitions — a regular expression cannot tell `@if` from `@ifSomething`, nor an email
 * from an interpolation. The tree can, so the colours the user finally sees come from here.
 *
 * Five types beyond the standard TypeScript ones: the `@` itself, the directives, the
 * interpolations, the bindings, and a tag that resolves to a `.fud` — which must be visibly
 * not a native element.
 *
 * The `@` travels apart from the construct it opens, and every construct here hands it over the
 * same way (`marked`). Two tokens cannot overlap, so this is not a token ADDED to the four: it
 * is one character taken off the front of each of them, which is why `@if` now colours as `@`
 * plus `if` and an interpolation no longer swallows its own marker.
 */

import {
  BUS_PREFIX,
  CLASS_PREFIX,
  EVENT_PREFIX,
  PROPERTY_PREFIX,
  REF_NAME,
  STYLE_PREFIX,
  documentRoots,
  span,
  type Attribute,
  type ElementNode,
  type ForNode,
  type ForeachNode,
  type HtmlContent,
  type IfNode,
  type RenderDirectiveNode,
  type RenderSectionNode,
  type SectionNode,
  type Span,
  type SwitchNode,
  type WhileNode,
} from '@fudic/compiler';
import type { FudicTokenType } from '../capabilities.js';
import type { CachedDocument } from '../document-cache.js';

/** One token: a stretch of the `.fud` and what it is. */
export interface FudicToken {
  readonly span: Span;
  readonly type: FudicTokenType;
}

/** Attribute name prefixes that make an attribute a binding (decisions 22–30). */
const BINDING_PREFIXES = [
  CLASS_PREFIX,
  STYLE_PREFIX,
  BUS_PREFIX,
  EVENT_PREFIX,
  PROPERTY_PREFIX,
] as const;

/**
 * The `@keyword` at `at`: the `@` plus the letters after it, and nothing else.
 *
 * `@code`, `@server`, `@client` and the control keywords carry no keyword span in the AST —
 * their node spans cover the whole construct, body included — so the one piece that IS a
 * directive is measured here. Exported because its two edges (a keyword ended by anything, and
 * a keyword that runs into the end of a half-typed file) are its whole contract.
 */
export function keywordSpanAt(source: string, at: number): Span {
  let end = at + 1;
  while (end < source.length && /[A-Za-z]/.test(source[end] as string)) end++;
  return span(at, end);
}

/** The name of a binding attribute, or `undefined` when it is a plain attribute. */
function bindingNameSpan(attribute: Attribute): Span | undefined {
  // `bus:(expr)="@h"` (decision 28.b): the name IS an expression, and it carries its own span.
  if (typeof attribute.name !== 'string') return attribute.name.span;

  const name = attribute.name;
  const isBinding = name === REF_NAME || BINDING_PREFIXES.some((prefix) => name.startsWith(prefix));
  return isBinding ? span(attribute.span.start, attribute.span.start + name.length) : undefined;
}

class TokenCollector {
  readonly #source: string;
  readonly #isComponent: (tag: string) => boolean;
  readonly #tokens: FudicToken[] = [];

  constructor(source: string, isComponent: (tag: string) => boolean) {
    this.#source = source;
    this.#isComponent = isComponent;
  }

  get tokens(): readonly FudicToken[] {
    return [...this.#tokens].sort((a, b) => a.span.start - b.span.start);
  }

  /** A token, over a span that is already known to exist — `marked` is what takes a maybe. */
  push(type: FudicTokenType, at: Span): void {
    this.#tokens.push({ span: at, type });
  }

  /**
   * The `@` at `at`, when there is one.
   *
   * Asked of the source rather than assumed, because two of the callers cannot promise it: a
   * layout directive's node span only reaches the `@` if the parser found one to reach back to
   * (`#constructStart`), and a binding name carries it for `@click` and never for `class:on`.
   */
  atMarker(at: number): void {
    if (this.#source[at] !== '@') return;
    this.push('fudAt', span(at, at + 1));
  }

  /**
   * A stretch that OPENS with the marker: the `@` as its own token, the rest as `type`.
   *
   * With no `@` there — a plain binding name — the stretch is pushed whole, so the one call
   * covers `@click` and `class:on` without the caller having to know which it has.
   */
  marked(type: FudicTokenType, at: Span | undefined): void {
    if (at === undefined) return;
    this.atMarker(at.start);
    const from = this.#source[at.start] === '@' ? at.start + 1 : at.start;
    if (from < at.end) this.push(type, span(from, at.end));
  }

  /** The `@keyword` of a construct that carries no keyword span of its own. */
  directiveAt(at: number): void {
    this.marked('fudDirective', keywordSpanAt(this.#source, at));
  }

  element(element: ElementNode): void {
    if (this.#isComponent(element.name)) {
      // `<app-badge>` and `</app-badge>`: the name only, never the angle brackets.
      this.push('fudComponentTag', span(element.openSpan.start + 1, element.openSpan.start + 1 + element.name.length));
      if (element.closeSpan !== undefined) {
        this.push(
          'fudComponentTag',
          span(element.closeSpan.start + 2, element.closeSpan.start + 2 + element.name.length),
        );
      }
    }
    for (const attribute of element.attributes) {
      this.marked('fudBinding', bindingNameSpan(attribute));
      // `id=@id`, `control="@userForm.name"`: the value is where most of the `@` of a real file
      // live, and until now nothing here looked at it — the attribute name was the whole story.
      for (const part of attribute.value) {
        if (part.type === 'razor-expression') this.atMarker(part.span.start);
      }
    }
  }

  walk(content: readonly HtmlContent[]): void {
    for (const node of content) this.node(node);
  }

  node(node: HtmlContent): void {
    switch (node.type) {
      case 'element':
        this.element(node);
        this.walk(node.children);
        return;
      case 'razor-expression':
      case 'raw-expression':
        this.marked('fudInterpolation', node.span);
        return;
      case 'inline-code':
        // `@{ … }` has no keyword: the marker is the two characters that open it.
        this.marked('fudDirective', span(node.span.start, node.span.start + 2));
        return;
      case 'if': {
        const branches = node as unknown as IfNode;
        this.directiveAt(node.span.start);
        for (const branch of branches.branches) this.walk(branch.body);
        if (branches.elseBody) this.walk(branches.elseBody);
        return;
      }
      case 'foreach':
      case 'for':
      case 'while': {
        this.directiveAt(node.span.start);
        this.walk((node as unknown as ForeachNode | ForNode | WhileNode).body);
        return;
      }
      case 'switch': {
        this.directiveAt(node.span.start);
        for (const branch of (node as unknown as SwitchNode).cases) this.walk(branch.body);
        return;
      }
      // The layout directives are the one family whose `keywordSpan` already excludes the `@`
      // (SDD-04), so their marker is not split off the keyword — it is picked up from the node
      // span, which is where the parser reached back to find it.
      case 'section': {
        const section = node as unknown as SectionNode;
        this.atMarker(node.span.start);
        this.push('fudDirective', section.keywordSpan);
        this.walk(section.children);
        return;
      }
      case 'render-body':
      case 'render-head':
        this.atMarker(node.span.start);
        this.push('fudDirective', (node as unknown as RenderDirectiveNode).keywordSpan);
        return;
      case 'render-section':
        this.atMarker(node.span.start);
        this.push('fudDirective', (node as unknown as RenderSectionNode).keywordSpan);
        return;
      default:
        // Text, comments, doctype, cdata, raw text: nothing of ours to colour.
        return;
    }
  }
}

/**
 * Every fudic token of a document.
 *
 * The `@code` block and its regions are included: they are directives too, and the TextMate
 * grammar has the same trouble with them as with the rest.
 */
export function semanticTokens(document: CachedDocument): readonly FudicToken[] {
  const collector = new TokenCollector(
    document.source,
    (tag) => document.registry.component(tag) !== undefined,
  );

  collector.walk(documentRoots(document.document));

  const code = document.document.code;
  if (code !== undefined) {
    collector.directiveAt(code.span.start);
    for (const part of code.parts) {
      if (part.type !== 'neutral-js') collector.directiveAt(part.span.start);
    }
  }
  return collector.tokens;
}
