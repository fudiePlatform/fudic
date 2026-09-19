/**
 * Component dependency resolution (the graph the emit needs BEFORE it can know what
 * to render). A `.fud` declares its dependencies with `<link rel="component" href>`
 * (SDD-10); the page cannot be composed until those links are followed transitively —
 * home.fud links app-card/app-button/app-badge, and app-card in turn links app-button.
 *
 * The compiler stays filesystem-free: I/O is INJECTED (`read`, `resolve`). This module
 * only reads the links off the AST and walks them.
 */

import { parseDocument, type ElementNode } from '../html/index.js';
import { atConstructs as constructs } from '../constructs.js';
import {
  structureDocument,
  type StructuredDocument,
  type ComponentDocument,
  type LayoutDocument,
  type RouteDocument,
} from '../document/index.js';
import {
  type Diagnostic,
  type ResolveIo,
  type Span,
  emptySpan,
  errorDiag,
  warningDiag,
} from '../types/index.js';
import { expandDocument, type DraggedLink, type OffsetMap } from '../expand/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';

/**
 * `FUD0422` — «a cycle in the layout chain» — is RETIRED with the chain itself (`FUD0439`).
 *
 * It cut a loop that only a layout pointing at another layout could form. A route points
 * once and a layout points nowhere, so the shortest loop that could exist needs a file that
 * may no longer exist. The code is not reused.
 */
/** A file used as a layout that holds no `@RenderBody()` (decision 82). */
const FUD_NO_RENDER_BODY = 'FUD0423';
/** A `@section` no `@RenderSection` in the chain consumes: its content would vanish. */
const FUD_ORPHAN_SECTION = 'FUD0429';
/** `<link rel="layout">` pointing at a file that is not a layout (decision 82). */
const FUD_NOT_A_LAYOUT = 'FUD0435';
/**
 * Two files of one graph that define the same tag (SDD-43 §4.5).
 *
 * It was a check nobody needed while every component of a document came from one project: two
 * files with the same host wrapper meant somebody had copied a file. With libraries the tag
 * space is SHARED — `customElements` is one registry per document, and the second `define()`
 * for a name throws — and the two files are now routinely written by two people who never
 * read each other's code.
 *
 * The message carries both paths because that is the only actionable part: one of the two has
 * to be renamed, and which one is the author's call.
 */
const FUD_DUPLICATE_TAG = 'FUD0761';

export type { ResolveIo } from '../types/index.js';

/** A component reached through the link graph. */
export interface ResolvedComponent {
  readonly tag: string;
  readonly path: string;
  readonly source: string;
  readonly doc: ComponentDocument;
  /** The `href`s of this component's own `<link rel="component">`. */
  readonly deps: readonly string[];
}

export interface ComponentGraph {
  readonly entry: StructuredDocument;
  /** Absolute path of the entry `.fud` — what makes the entry addressable as a component. */
  readonly entryPath: string;
  /**
   * The entry's source AFTER the snippet expansion (SDD-29 §4.10) — the text every pass
   * downstream reads, and the one every span in `entry` is an offset into.
   *
   * Identical to the file when it holds no snippet, which is every file of a project that
   * uses none.
   */
  readonly entrySource: string;
  /**
   * Where each position of `entrySource` came from: the entry itself, or the file of a
   * snippet it expanded. A file with no expansion has an empty table that answers nothing,
   * and then a position is already where it says it is.
   */
  readonly entryMap: OffsetMap;
  /**
   * The entry exactly as it is ON DISK, before the expansion, with the document that text
   * parses to.
   *
   * The source map needs it: a `.fud` in DevTools has to be the file the author opens, and
   * `entrySource` is the text the compiler made. A position of a body expanded from another
   * file has no line in it, and `entryMap.entryOffset` gives the `@render` instead.
   */
  readonly entryOrigin: { readonly source: string; readonly document: StructuredDocument };
  /** The `href`s the entry links directly. */
  readonly entryDeps: readonly string[];
  /** Every component reachable from the entry, keyed by tag. */
  readonly components: ReadonlyMap<string, ResolvedComponent>;
  /**
   * The tag each of the entry's OWN `<link rel="component">` declares, keyed by the link
   * element so a diagnostic has a span to point at. A link whose file is missing, or is not a
   * component, has no entry here — a rule about an unused declaration says nothing about one
   * that does not resolve.
   */
  readonly entryLinkTags: ReadonlyMap<ElementNode, string>;
  /**
   * Every `.fud` reached through a `<link rel="snippet">`, absolute and deduplicated.
   *
   * A snippet file is an edge of the document's dependency graph like a component is: its
   * markup ends up inside whoever imports it, so changing it has to rebuild them (SDD-29
   * §5). It is not in `components` because it defines no tag and emits no module — the host
   * watches it, and nothing else asks.
   */
  readonly snippetFiles: readonly string[];
}

/**
 * The entry itself as a `ResolvedComponent`, when the entry IS a component — memoized ON
 * the graph.
 *
 * The resolver does not put the entry in `components`: that map is what the entry REACHES.
 * But every question the emit asks about the graph — who hydrates, what composes what — has
 * to include the file being compiled, or the same `.fud` compiles differently depending on
 * whether it was reached from a page or opened on its own. That is not a cosmetic
 * difference: it decides whether a component claims its children.
 *
 * Memoized because `ExtractedCode` is memoized on this object (`codeOf`): a second literal
 * with the same fields would be a second Oxc invocation for one file, and the golden rule
 * says one.
 */
const entryComponents = new WeakMap<ComponentGraph, ResolvedComponent>();

export function entryComponent(graph: ComponentGraph): ResolvedComponent | undefined {
  const entry = graph.entry;
  // A cycle (A links B, B links A) puts the entry in `components` too; then it is already
  // there, with the object every other reader uses.
  if (entry.type !== 'component-document' || graph.components.has(entry.name)) return undefined;
  const cached = entryComponents.get(graph);
  if (cached !== undefined) return cached;
  const comp: ResolvedComponent = {
    tag: entry.name,
    path: graph.entryPath,
    source: graph.entrySource,
    doc: entry,
    deps: graph.entryDeps,
  };
  entryComponents.set(graph, comp);
  return comp;
}

/** Every component the graph knows about: the entry, when it is one, and what it reaches. */
export function allComponents(graph: ComponentGraph): readonly ResolvedComponent[] {
  const own = entryComponent(graph);
  return own === undefined ? [...graph.components.values()] : [own, ...graph.components.values()];
}

/** The component of a tag, the entry included. */
export function componentOf(graph: ComponentGraph, tag: string): ResolvedComponent | undefined {
  const own = entryComponent(graph);
  return own?.tag === tag ? own : graph.components.get(tag);
}

/** The static `href` of a `<link>` element, or undefined. */
export function linkHref(link: ElementNode): string | undefined {
  for (const attr of link.attributes) {
    if (attr.name === 'href') {
      return attr.value.map((p) => (p.type === 'attribute-text' ? p.value : '')).join('');
    }
  }
  return undefined;
}

/**
 * Parse one `.fud` into its structured document, keeping what the two passes had to say.
 *
 * Both of them report — the HTML/`@` parser (`FUD0110`, `FUD0111`, `FUD0114`, …) and the
 * structural pass (`FUD0150`–`FUD0160`) — and this function used to take `.value` twice and
 * drop both lists. That is what left a diagnostic visible in the editor and absent from the
 * build: the language server parses on its own, the build only ever came through here.
 */
function parse(source: string): ParseResult<StructuredDocument> {
  const parsed = parseDocument(source, { atConstructs: constructs });
  const structured = structureDocument(source, parsed.value);
  const diagnostics = [...parsed.diagnostics, ...structured.diagnostics];
  return diagnostics.length === 0
    ? ok(structured.value)
    : withDiagnostics(structured.value, diagnostics);
}

/** One `.fud`, read, parsed and EXPANDED: what every reader of the graph works on. */
interface LoadedFud {
  /** The expanded source — identical to the file when it holds no snippet (SDD-29 §4.10). */
  readonly source: string;
  readonly doc: StructuredDocument;
  readonly map: OffsetMap;
  readonly diagnostics: readonly Diagnostic[];
  /** The `<link rel="snippet">` files it reached, for the host to watch. */
  readonly snippetFiles: readonly string[];
  /** The component links its invoked snippets drag in, each with the file it is written in. */
  readonly dragged: readonly DraggedLink[];
  /** The file as it is on disk, and the document that text parses to. */
  readonly origin: { readonly source: string; readonly document: StructuredDocument };
}

/**
 * Read one `.fud` and hand back the text the rest of the compiler works on.
 *
 * The expansion sits HERE, between reading a file and everything that reads its tree,
 * because this is the one door a build comes through — and because after it there is no
 * snippet left to see (SDD-29 §4.8). Every pass downstream gets a source and a document like
 * any other; the table that sends a position back to the file it came from travels beside
 * them, for whoever has to report.
 *
 * The diagnostics come back in ORIGINAL coordinates, as every caller of this compiler
 * expects: the synthetic source is an artifact of the expansion and never leaves as a
 * coordinate system.
 */
function load(path: string, io: ResolveIo): LoadedFud {
  const source = io.read(path);
  const parsed = parse(source);
  const expansion = expandDocument(path, source, parsed.value, io);
  return {
    source: expansion.source,
    doc: expansion.document,
    map: expansion.map,
    diagnostics: [...parsed.diagnostics, ...expansion.diagnostics],
    snippetFiles: expansion.files,
    dragged: expansion.dragged,
    origin: { source, document: parsed.value },
  };
}

/**
 * Resolve the transitive component graph from an entry `.fud` (page or component).
 *
 * The graph and nothing else: what the walk had to SAY about it — a tag two files define —
 * is reported by `resolveDocument`, which is the entry point a build goes through. This one
 * answers the shape of the graph for a caller that already has the file it cares about.
 */
export function resolveComponents(entryPath: string, io: ResolveIo): ComponentGraph {
  const loaded = load(entryPath, io);
  const entry = loaded.doc;
  const walk = newWalk(io);
  visitComponents(entry.links, entryPath, walk);
  visitDragged(loaded.dragged, walk);
  const entryDeps = entry.links.map(linkHref).filter((h): h is string => h !== undefined);
  const entryLinkTags = linkTags(entry.links, entryPath, io, walk.byPath);
  return {
    entry,
    entryPath,
    entrySource: loaded.source,
    entryMap: loaded.map,
    entryOrigin: loaded.origin,
    entryDeps,
    components: walk.components,
    entryLinkTags,
    snippetFiles: [...new Set([...loaded.snippetFiles, ...walk.snippetFiles])],
  };
}

/**
 * Which tag each `<link rel="component">` of a document declares.
 *
 * A `<link>` carries a PATH and a component carries its identity in its root tag (decision
 * 75), so the two coincide only by convention and the question can be answered nowhere but
 * here — this is where the files were read. It is what lets `contractDiagnostics` report a
 * declaration nobody uses (BUG-32 T6) without resolving a path of its own.
 *
 * Keyed by the link ELEMENT, because a diagnostic needs a span to point at. A link whose file
 * is missing, or is not a component, is simply absent: a rule about an unused declaration has
 * nothing to say about one that does not resolve.
 */
function linkTags(
  links: readonly ElementNode[],
  fromPath: string,
  io: ResolveIo,
  byPath: ReadonlyMap<string, string>,
): ReadonlyMap<ElementNode, string> {
  const out = new Map<ElementNode, string>();
  for (const link of links) {
    const href = linkHref(link);
    if (href === undefined) continue;
    const tag = byPath.get(io.resolve(fromPath, href));
    if (tag !== undefined) out.set(link, tag);
  }
  return out;
}

/**
 * The state one graph walk carries.
 *
 * An object and not six parameters, because the walk grew a third map: `definedBy` is the
 * one that spans the whole document — the entry included — and passing it alongside the
 * other two is where a caller starts forgetting one.
 */
interface Walk {
  readonly io: ResolveIo;
  readonly components: Map<string, ResolvedComponent>;
  /** Path → tag, filled by the same walk that reads the files, so nothing is read twice. */
  readonly byPath: Map<string, string>;
  /**
   * Tag → the file the walk took it from. Almost `components` keyed the other way, and kept
   * apart from it on purpose: `components` is *what is in the graph*, and a duplicate is not
   * added to it, so it cannot answer which file claimed a tag first.
   *
   * What it holds is what the document REACHES, the entry not included. A file compiled on
   * its own is not a document: nothing runs a `define` for it alone, and the page that
   * composes it reaches it through the graph like everything else — which is where the two
   * files meet and where the diagnostic belongs.
   */
  readonly definedBy: Map<string, string>;
  /** Every `<link rel="snippet">` file any component of the walk reached (SDD-29 §5). */
  readonly snippetFiles: Set<string>;
  readonly diagnostics: Diagnostic[];
}

function newWalk(io: ResolveIo): Walk {
  return {
    io,
    components: new Map(),
    byPath: new Map(),
    definedBy: new Map(),
    snippetFiles: new Set(),
    diagnostics: [],
  };
}

/**
 * The `href` of each link that has one, with the span to report about it.
 *
 * One place where a link without an `href` is dropped, used by both loops of the walk: the
 * entry's links and every dependency's are the same question asked twice.
 */
function targetsOf(links: readonly ElementNode[]): readonly { href: string; at: Span }[] {
  const out: { href: string; at: Span }[] = [];
  for (const link of links) {
    const href = linkHref(link);
    if (href !== undefined) out.push({ href, at: link.span });
  }
  return out;
}

/**
 * Walk the `<link rel="component">` graph from `links`, filling `components` by tag.
 *
 * `visit` is exported through `visitDragged` as well, because a snippet's dependencies enter
 * the graph by the same door: the only difference is which file their `href` is relative to.
 */
function visitComponents(links: readonly ElementNode[], fromPath: string, walk: Walk): void {
  for (const target of targetsOf(links)) {
    visitComponent(walk.io.resolve(fromPath, target.href), target.at, walk);
  }
}

/**
 * The component links an expansion dragged in (SDD-29 §4.5).
 *
 * Each one is resolved against the file that WROTE it — the snippet's, never the caller's —
 * which is the whole of what dragging means: the author of the page declares nothing, and
 * the library keeps its own paths.
 */
function visitDragged(dragged: readonly DraggedLink[], walk: Walk): void {
  for (const link of dragged) {
    const path = walk.io.resolve(link.from, link.href);
    visitComponent(path, emptySpan(0), walk);
  }
}

/** One file of the graph: read it, expand it, register its tag, and follow what it names. */
function visitComponent(path: string, at: Span, walk: Walk): void {
  {
    const loaded = load(path, walk.io);
    const doc = loaded.doc;
    const source = loaded.source;
    for (const file of loaded.snippetFiles) walk.snippetFiles.add(file);
    if (doc.type !== 'component-document') return; // a linked file must be a component
    // BEFORE the shared-dependency guard: a file reached twice still declares the same tag,
    // and the second link needs the answer as much as the first.
    walk.byPath.set(path, doc.name);
    // The same file reached twice is a shared dependency and is the common case; a DIFFERENT
    // file under the same tag is `FUD0761`, anchored on the link that brought the second one
    // in — the one line an author can act on. One per such link, and not one per tag: two
    // links onto the same wrong file are two places to go and fix it.
    const defined = walk.definedBy.get(doc.name);
    if (defined !== undefined && defined !== path) {
      walk.diagnostics.push(
        errorDiag(
          FUD_DUPLICATE_TAG,
          `two files define the tag "${doc.name}": ${defined} and ${path}. customElements is one registry per document, so the second define() throws`,
          at,
        ),
      );
      return;
    }
    // A cycle (A links B, B links A) reaches the ENTRY through the graph, and then the entry
    // belongs in `components` like anything else — `entryComponent` reads that to hand every
    // reader one object per file. So the shared-dependency guard stays on `components`, which
    // is what «already resolved» means, and `definedBy` answers only the question above.
    if (walk.components.has(doc.name)) return;
    walk.definedBy.set(doc.name, path);
    const deps = doc.links.map(linkHref).filter((h): h is string => h !== undefined);
    walk.components.set(doc.name, { tag: doc.name, path, source, doc, deps });
    for (const dep of targetsOf(doc.links)) {
      visitComponent(walk.io.resolve(path, dep.href), dep.at, walk);
    }
    // A component may use snippets too, and theirs drag the same way (§4.5).
    visitDragged(loaded.dragged, walk);
  }
}

// --- Layouts (SDD-21 §3.3) ---------------------------------------------------------

/** A layout reached through the `rel="layout"` chain. */
export interface ResolvedLayout {
  readonly path: string;
  readonly source: string;
  readonly doc: LayoutDocument;
  /** This layout's own `<link rel="component">` hrefs. */
  readonly deps: readonly string[];
}

/**
 * The entry plus its layout and every component either of them reaches. Extends
 * `ComponentGraph`, so every consumer of the component-only graph keeps working.
 */
export interface DocumentGraph extends ComponentGraph {
  /**
   * The entry's layout: AT MOST ONE, and empty for anything that is not a route with a
   * resolvable link. It stays a list because every reader of it — the component order, the
   * orphan sections, the emit — reads it as one, and a list of at most one costs them
   * nothing while a second field would cost them a rewrite.
   */
  readonly layouts: readonly ResolvedLayout[];
}

/**
 * Resolve the transitive graph from an entry `.fud`: its layout chain (decision 87) plus
 * every component reachable from the entry AND from every layout in the chain.
 *
 * Never throws and never loops: a cycle is reported and cut. Diagnostics about a link are
 * anchored on the link element, which may live in a layout rather than in the entry — the
 * message names the file, and the host (SDD-19) maps it back when it reports.
 */
export function resolveDocument(entryPath: string, io: ResolveIo): ParseResult<DocumentGraph> {
  const loaded = load(entryPath, io);
  // The entry's OWN syntax errors, first because they come first in the file. Only the
  // entry's: a dependency's spans are offsets into a different file, and every dependency
  // — component or layout — is a module of its own that comes back through here, so its
  // diagnostics surface against its own source instead of being reported on this one.
  const diagnostics: Diagnostic[] = [...loaded.diagnostics];
  const entry = loaded.doc;
  const entrySource = loaded.source;
  const walk = newWalk(io);
  const components = walk.components;
  const layouts: ResolvedLayout[] = [];

  // ONE step, not a walk. A route names a layout and a layout names none (`FUD0439`), so
  // there is nothing to recurse into: no chain to unwind, and no cycle to cut either — a
  // cycle needs two links that both point onwards, and only one kind of file points at all.
  if (entry.type === 'route-document' && entry.layoutHref !== '') {
    const path = io.resolve(entryPath, entry.layoutHref);
    const at = entry.layoutLink.span;
    const parent = load(path, io);
    const source = parent.source;
    const doc = parent.doc;
    for (const file of parent.snippetFiles) walk.snippetFiles.add(file);
    if (doc.type === 'layout-document') {
      const deps = doc.links.map(linkHref).filter((h): h is string => h !== undefined);
      layouts.push({ path, source, doc, deps });
      // A layout may render snippets of its own, and theirs join the document's graph.
      visitDragged(parent.dragged, walk);
    } else {
      // A shell with no `@RenderBody()` structures as a page: it was MEANT to be a layout
      // (something points at it), so name the missing directive rather than the role.
      diagnostics.push(
        doc.type === 'page-document'
          ? errorDiag(FUD_NO_RENDER_BODY, `a layout must contain @RenderBody(): ${path}`, at)
          : errorDiag(FUD_NOT_A_LAYOUT, `<link rel="layout"> must point at a layout: ${path}`, at),
      );
    }
  }

  // Components are collected OUTERMOST LAYOUT FIRST and the entry last, so the order of
  // the emitted `<style type="module">` block matches the head cascade of decision 88 —
  // and therefore matches the equivalent monolithic page.
  for (const layout of [...layouts].reverse()) {
    visitComponents(layout.doc.links, layout.path, walk);
  }
  visitComponents(entry.links, entryPath, walk);
  visitDragged(loaded.dragged, walk);
  // What the walk had to say, after the layout's links and the entry's: a tag two files
  // define (`FUD0761`) is a fact of the whole document, and a layout is part of it.
  diagnostics.push(...walk.diagnostics);

  reportOrphanSections(entry, layouts, diagnostics);

  const entryDeps = entry.links.map(linkHref).filter((h): h is string => h !== undefined);
  const entryLinkTags = linkTags(entry.links, entryPath, io, walk.byPath);
  const graph: DocumentGraph = {
    entry,
    entryPath,
    entrySource,
    entryMap: loaded.map,
    entryOrigin: loaded.origin,
    entryDeps,
    components,
    entryLinkTags,
    snippetFiles: [...new Set([...loaded.snippetFiles, ...walk.snippetFiles])],
    layouts,
  };
  return diagnostics.length === 0 ? ok(graph) : withDiagnostics(graph, diagnostics);
}

/**
 * A `@section x` that no `@RenderSection(x)` in the chain consumes is a warning (decision
 * 86): the content silently disappears from the output, which is always an author bug. The
 * reverse — a rendered section the route does not declare — is silence by design.
 */
function reportOrphanSections(
  entry: StructuredDocument,
  layouts: readonly ResolvedLayout[],
  diagnostics: Diagnostic[],
): void {
  if (entry.type !== 'route-document') return;
  const route: RouteDocument = entry;
  const rendered = new Set<string>();
  for (const layout of layouts) {
    for (const rs of layout.doc.renderSections) rendered.add(rs.name);
  }
  for (const section of route.sections) {
    if (section.name !== '' && !rendered.has(section.name)) {
      diagnostics.push(
        warningDiag(
          FUD_ORPHAN_SECTION,
          `no @RenderSection(${section.name}) in the layout chain: this section is not rendered`,
          section.span,
        ),
      );
    }
  }
}
