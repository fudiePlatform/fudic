/**
 * The expansion (SDD-29 §4.8, §4.10).
 *
 * It writes the text the author would have written — the caller's file, with every
 * `@render` replaced in its place by the snippet's markup and every `@snippet` removed — and
 * then the document is parsed from THAT. What comes out is, byte for byte, the tree of that
 * markup written by hand, which is the whole of criterion 4 and the reason nothing
 * downstream of here has to learn that snippets exist.
 *
 * Two rules do the work, and both are about not breaking the text:
 *
 * - **A parameter is replaced where the body READS it**, and where that is comes from Oxc,
 *   never from a search: `obj.title` names no `title`, `{ title: 1 }` names no `title`, and
 *   `(title) => title` declares its own.
 * - **An implicit expression whose head is replaced is rewritten to the explicit form.**
 *   `@title.length` with `p.title` becomes `@((p.title).length)`; leaving it as
 *   `@(p.title).length` would be an `@` followed by something that is not a chain, which
 *   stops being an expression at all. When the argument is itself a plain chain and the atom
 *   is nothing but the parameter, the simple form is kept: `@render card(p.title)` puts
 *   `@p.title` in the output, which is what a person would have typed.
 *
 * Nothing here throws. A call that does not resolve is left in the text exactly as written —
 * an inert node the emit paints as nothing — with its diagnostic already reported.
 */

import { type Diagnostic, type ResolveIo, type Span, span } from '../types/index.js';
import {
  parseDocument,
  type Attribute,
  type ElementNode,
  type HtmlContent,
} from '../html/index.js';
import { staticAttribute } from './links.js';
import { atConstructs } from '../constructs.js';
import { structureDocument, type StructuredDocument } from '../document/index.js';
import { documentRoots } from '../semantic/index.js';
import { JsBatch, type JsFragmentKind, type OxcNode } from '../oxc/index.js';
import { branchesOf, collectTemplateJs } from '../emit/constructs.js';
import type { ControlNode } from '../control/index.js';
import { freeReferenceNodes } from '../emit/scope.js';
import type { RazorExpression } from '../at/index.js';
import type { RenderCallNode, SnippetDeclNode } from '../snippet/index.js';
import { checkRenderCall, type BoundArgument, type SnippetFrame } from './check.js';
import { ExpandedText, type OffsetMap } from './offsets.js';
import { SnippetRegistry, type ResolvedSnippet, type SnippetScope } from './scope.js';

/** What a build gets back from the expansion. */
export interface Expansion {
  /** The synthetic source. Identical to the input when there was nothing to expand. */
  readonly source: string;
  /** The document parsed from it — with no `SnippetDecl` and no `RenderCall` left in it. */
  readonly document: StructuredDocument;
  /** Where every position of `source` comes from. */
  readonly map: OffsetMap;
  readonly diagnostics: readonly Diagnostic[];
  /** Every other `.fud` the expansion read, for the host to watch (§5). */
  readonly files: readonly string[];
  /** The `<link rel="component">` the invoked snippets drag into the caller's graph (§4.5). */
  readonly dragged: readonly DraggedLink[];
}

/** A component link a snippet brings with it: the href, and the file it is written in. */
export interface DraggedLink {
  readonly href: string;
  /** The file the `href` is relative to — the snippet's, never the caller's. */
  readonly from: string;
}

/** One place a body reads a parameter, and which parameter it is. */
interface ParamRef {
  readonly at: Span;
  readonly index: number;
  /** The implicit atom this reference is the head of, when it is one. */
  readonly atom?: RazorExpression;
}

/** What a snippet's body needs rewritten, computed once per snippet and reused per call. */
interface BodyPlan {
  readonly refs: readonly ParamRef[];
  readonly renders: readonly RenderCallNode[];
}

/**
 * The text being copied out of one file, and what has to change inside it.
 *
 * `outer` is where the arguments were written, and it is `null` only for the file being
 * compiled — which binds no parameters, so nothing in it ever asks.
 */
interface Frame {
  readonly file: string;
  readonly source: string;
  readonly plan: BodyPlan;
  readonly args: readonly BoundArgument[];
  readonly outer: Frame | null;
  readonly scope: SnippetScope;
  readonly stack: readonly SnippetFrame[];
}

/** A plain property chain: what can stay an implicit expression after a substitution. */
const CHAIN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;

/** Memoized per declaration: a snippet invoked ten times is analyzed once. */
const PLANS = new WeakMap<SnippetDeclNode, BodyPlan>();

/** The empty plan: what the file being compiled has, since it binds no parameters. */
const NO_PLAN: BodyPlan = { refs: [], renders: [] };

/** The five control constructs, whose bodies hang off their branches and not off `children`. */
const CONTROLS: ReadonlySet<string> = new Set(['if', 'switch', 'foreach', 'for', 'while']);

/**
 * Every node of a tree, depth-first, without descending into a nested declaration.
 *
 * A control construct is walked through its BRANCHES: `@if` and the three loops keep their
 * body there and not in `children`, and a walk that only read `children` would miss every
 * `@render` written inside a loop — which is the commonest place to write one.
 */
function walkContent(nodes: readonly HtmlContent[], visit: (node: HtmlContent) => boolean): void {
  for (const node of nodes) {
    if (!visit(node)) continue;
    if (CONTROLS.has(node.type)) {
      for (const branch of branchesOf(node as unknown as ControlNode)) walkContent(branch.body, visit);
      continue;
    }
    const children = (node as { readonly children?: readonly HtmlContent[] }).children;
    if (children !== undefined) walkContent(children, visit);
  }
}

/** The `@render` of a tree, in source order, those inside a nested declaration excluded. */
function rendersOf(nodes: readonly HtmlContent[]): readonly RenderCallNode[] {
  const out: RenderCallNode[] = [];
  walkContent(nodes, (node) => {
    if (node.type === 'snippet') return false;
    if (node.type === 'render') out.push(node as unknown as RenderCallNode);
    return true;
  });
  return out;
}

/** The implicit atoms of a tree, by the offset their expression starts at. */
function implicitAtoms(nodes: readonly HtmlContent[]): ReadonlyMap<number, RazorExpression> {
  const out = new Map<number, RazorExpression>();
  const consider = (atom: RazorExpression): void => {
    if (atom.kind === 'implicit') out.set(atom.expr.start, atom);
  };
  walkContent(nodes, (node) => {
    if (node.type === 'snippet') return false;
    if (node.type === 'razor-expression') consider(node as RazorExpression);
    if (node.type === 'element') {
      for (const attribute of (node as ElementNode).attributes as readonly Attribute[]) {
        for (const part of attribute.value) {
          if (part.type === 'razor-expression') consider(part);
        }
      }
    }
    return true;
  });
  return out;
}

/**
 * Where a snippet's body reads its parameters, and what it renders.
 *
 * One Oxc batch per snippet, over its body's fragments only. It is a batch for a TEXT that
 * no other pass parses — the body as the author wrote it, with its parameters still
 * unbound — so the golden rule holds: what the emit parses later is the expanded file, and
 * that is a different text.
 */
function planOf(snippet: ResolvedSnippet): BodyPlan {
  const cached = PLANS.get(snippet.decl);
  if (cached !== undefined) return cached;

  const names = new Map<string, number>();
  snippet.params.forEach((param, index) => {
    for (const name of param.declares) names.set(name, index);
  });
  const renders = rendersOf(snippet.decl.children);

  const refs: ParamRef[] = [];
  if (names.size > 0) {
    const batch = new JsBatch(snippet.source);
    const ids: number[] = [];
    const register = (kind: JsFragmentKind, at: Span): void => {
      if (at.end > at.start) ids.push(batch.add(kind, at));
    };
    collectTemplateJs(snippet.decl.children, register);
    const parsed = batch.parse().value;
    const atoms = implicitAtoms(snippet.decl.children);
    for (const id of ids) {
      for (const node of freeReferenceNodes([parsed.ast(id)])) {
        const index = names.get(String((node as OxcNode)['name']));
        if (index === undefined) continue;
        const at = parsed.mapSpan(node.start, node.end);
        const atom = atoms.get(at.start);
        refs.push({ at, index, ...(atom !== undefined ? { atom } : {}) });
      }
    }
    refs.sort((a, b) => a.at.start - b.at.start);
  }

  const plan: BodyPlan = { refs, renders };
  PLANS.set(snippet.decl, plan);
  return plan;
}

/** Whether `inner` lies within `outer`. */
function inside(outer: Span, inner: Span): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

/**
 * The body's content without the whitespace that belongs to the braces.
 *
 * The `{` and the `}` are delimiters, and the newline and the indentation after them are how
 * a declaration is laid out, not what it renders. Copied as they are, a `@render` written
 * between two words would put a space on either side of the markup it inserts — which is not
 * what the same markup written by hand does, and criterion 4 is exactly that comparison.
 */
function trimmed(source: string, at: Span): Span {
  let start = at.start;
  let end = at.end;
  while (start < end && /\s/u.test(source.charAt(start))) start++;
  while (end > start && /\s/u.test(source.charAt(end - 1))) end--;
  return span(start, end);
}

class Expander {
  readonly #out = new ExpandedText();
  readonly #diagnostics: Diagnostic[] = [];
  readonly #dragged: DraggedLink[] = [];
  readonly #seenLinks = new Set<string>();
  readonly #entry: string;

  constructor(entry: string) {
    this.#entry = entry;
  }

  get diagnostics(): readonly Diagnostic[] {
    return this.#diagnostics;
  }

  get dragged(): readonly DraggedLink[] {
    return this.#dragged;
  }

  get text(): string {
    return this.#out.text;
  }

  build(): OffsetMap {
    return this.#out.build();
  }

  /** The whole file: its text, minus the spans removed, with its calls expanded. */
  file(frame: Frame, whole: Span, removed: readonly Span[]): void {
    const cuts = [...removed].sort((a, b) => a.start - b.start);
    let at = whole.start;
    for (const cut of cuts) {
      this.region(frame, span(at, cut.start));
      at = cut.end;
    }
    this.region(frame, span(at, whole.end));
  }

  /**
   * One stretch of a frame's text, with the edits that fall inside it applied.
   *
   * The edits — parameter reads and nested calls — are interleaved in source order, so the
   * text between them is copied verbatim and the offsets stay one for one.
   */
  region(frame: Frame, at: Span, bare = false): void {
    const edits: { readonly at: Span; readonly apply: () => void }[] = [];
    for (const ref of frame.plan.refs) {
      const where = ref.atom?.span ?? ref.at;
      // A reference that IS the whole region needs no parentheses of its own: whatever asked
      // for the region already decided what wraps it.
      const whole = bare && where.start === at.start && where.end === at.end;
      if (inside(at, where)) {
        edits.push({ at: where, apply: () => this.#reference(frame, ref, whole) });
      }
    }
    for (const call of frame.plan.renders) {
      if (inside(at, call.span)) edits.push({ at: call.span, apply: () => this.#call(frame, call) });
    }
    edits.sort((a, b) => a.at.start - b.at.start);

    let cursor = at.start;
    for (const edit of edits) {
      // An edit already covered by a previous one — a parameter read inside a nested call's
      // arguments — is applied by that one, in the frame the call opens.
      if (edit.at.start < cursor) continue;
      this.#out.copy(frame.file, frame.source, span(cursor, edit.at.start));
      edit.apply();
      cursor = edit.at.end;
    }
    this.#out.copy(frame.file, frame.source, span(cursor, at.end));
  }

  /** A parameter read: the argument's text in its place, parenthesized to keep precedence. */
  #reference(frame: Frame, ref: ParamRef, bare: boolean): void {
    // Every parameter has a binding — `bind` fills one per parameter, whether the call
    // covered it or not — and a reference is indexed by the parameter it reads.
    const arg = frame.args[ref.index]!;
    const anchor = { file: frame.file, at: ref.at };
    const atom = ref.atom;
    if (atom === undefined) {
      this.#argument(frame, arg, anchor, !bare);
      return;
    }
    // The atom is `@` plus a chain that starts with the parameter. What follows it inside the
    // chain — `.length`, `(x)`, `[0]` — has to come along.
    const tail = span(ref.at.end, atom.expr.end);
    const text = arg.empty ? '' : frame.source.slice(arg.value.start, arg.value.end);
    if (tail.end === tail.start && !arg.empty && !arg.fromDefault && CHAIN.test(text)) {
      // Nothing after it and a plain chain in: the implicit form survives, and the output is
      // what the author would have written by hand.
      this.#out.synthetic('@', anchor);
      this.#argument(frame, arg, anchor, false);
      return;
    }
    // The `@( … )` already groups what it holds, so the argument only needs parentheses of
    // its own when something follows it: `@(a + b)` is right, `@((a + b).length)` is too, and
    // `@(a + b.length)` would be neither.
    this.#out.synthetic('@(', anchor);
    this.#argument(frame, arg, anchor, tail.end > tail.start);
    this.#out.copy(frame.file, frame.source, tail);
    this.#out.synthetic(')', anchor);
  }

  /** The text that fills a parameter: an argument, a default, or `undefined`. */
  #argument(
    frame: Frame,
    arg: BoundArgument,
    anchor: { readonly file: string; readonly at: Span },
    parens: boolean,
  ): void {
    if (arg.empty) {
      this.#out.synthetic('undefined', anchor);
      return;
    }
    if (parens) this.#out.synthetic('(', anchor);
    if (arg.fromDefault) {
      // A default is written in the snippet's own file and mentions nothing of the caller.
      this.#out.copy(arg.file, frame.source, arg.value);
    } else {
      // An argument is written in the frame that called, and may read ITS parameters. A
      // reference only exists in a body frame, and a body frame always has a caller.
      this.region(frame.outer!, arg.value, !parens);
    }
    if (parens) this.#out.synthetic(')', anchor);
  }

  /** A `@render`: the snippet's body in its place, or the call left inert. */
  #call(frame: Frame, call: RenderCallNode): void {
    const own: Diagnostic[] = [];
    const resolved = checkRenderCall(call, frame.scope, frame.file, frame.stack, own);
    this.#report(frame.file, own);
    if (resolved === undefined) {
      this.#out.copy(frame.file, frame.source, call.span);
      return;
    }
    // The OUTERMOST call is the one a source map points at: everything under it, however many
    // files deep, belongs to the line the author wrote in this file.
    const outermost = frame.outer === null;
    if (outermost) this.#out.anchoredAt(call.span.start);
    this.#expand(frame, resolved.snippet, resolved.args);
    if (outermost) this.#out.anchoredAt(null);
  }

  #expand(frame: Frame, snippet: ResolvedSnippet, args: readonly BoundArgument[]): void {
    this.#drag(snippet);
    const inner: Frame = {
      file: snippet.file,
      source: snippet.source,
      plan: planOf(snippet),
      args,
      outer: frame,
      scope: snippet.scope(),
      stack: [...frame.stack, { file: snippet.file, name: snippet.decl.name }],
    };
    this.region(inner, trimmed(snippet.source, snippet.decl.contentSpan));
  }

  /**
   * The component links of an invoked snippet, deduplicated by file and href.
   *
   * Only of the snippets actually invoked (§4.5), and among those only the links whose file
   * name matches a tag the body writes: a file of twenty snippets from which one is called
   * does not put nineteen components into the caller's bundle. The filename is the
   * approximation on purpose — the tag a link declares is only known by opening the file, and
   * opening it here would be a second resolver. A link dragged in vain costs one resolve and
   * nothing else: the graph is keyed by tag, and only what the markup names is emitted.
   */
  #drag(snippet: ResolvedSnippet): void {
    if (snippet.componentLinks.length === 0) return;
    const used = new Set<string>();
    walkContent(snippet.decl.children, (node) => {
      if (node.type === 'element') used.add((node as ElementNode).name);
      return true;
    });
    for (const link of snippet.componentLinks) {
      const href = staticAttribute(link, 'href');
      if (href === undefined) continue;
      const tag = href.replace(/^.*[/\\]/u, '').replace(/\.fud$/u, '');
      if (!used.has(tag)) continue;
      const key = `${snippet.file} ${href}`;
      if (this.#seenLinks.has(key)) continue;
      this.#seenLinks.add(key);
      this.#dragged.push({ href, from: snippet.file });
    }
  }

  #report(file: string, produced: readonly Diagnostic[]): void {
    for (const d of produced) this.#diagnostics.push(file === this.#entry ? d : { ...d, file });
  }
}

/**
 * Expand every `@render` of a document and drop every `@snippet`, returning the synthetic
 * source and the document parsed from it.
 *
 * A file with neither is returned untouched — same text, same document object — so a project
 * that uses no snippets pays nothing, not even a re-parse.
 */
export function expandDocument(
  path: string,
  source: string,
  document: StructuredDocument,
  io: ResolveIo,
): Expansion {
  const registry = new SnippetRegistry(io);
  const diagnostics: Diagnostic[] = [];
  const scope = registry.scopeOf(path, source, document, diagnostics);
  // `documentRoots` is where every pass asks what a document holds, and it holds the
  // declarations too — which is right for it and harmless here, because the walk does not
  // enter one: what a declaration renders is decided when somebody invokes it.
  const calls = rendersOf(documentRoots(document));

  if (calls.length === 0 && document.snippets.length === 0) {
    return {
      source,
      document,
      map: new ExpandedText().build(),
      diagnostics,
      files: registry.files,
      dragged: [],
    };
  }

  const expander = new Expander(path);
  const frame: Frame = {
    file: path,
    source,
    plan: { ...NO_PLAN, renders: calls },
    args: [],
    outer: null,
    scope,
    stack: [],
  };
  expander.file(
    frame,
    span(0, source.length),
    document.snippets.map((s) => s.span),
  );

  const expandedSource = expander.text;
  const reparsed = parseDocument(expandedSource, { atConstructs });
  const structured = structureDocument(expandedSource, reparsed.value);
  return {
    source: expandedSource,
    document: structured.value,
    map: expander.build(),
    diagnostics: [...diagnostics, ...expander.diagnostics],
    files: registry.files,
    dragged: expander.dragged,
  };
}
