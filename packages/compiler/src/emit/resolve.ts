/**
 * Component dependency resolution (the graph the emit needs BEFORE it can know what
 * to render). A `.fud` declares its dependencies with `<link rel="component" href>`
 * (SDD-10); the page cannot be composed until those links are followed transitively —
 * home.fud links app-card/app-button/app-badge, and app-card in turn links app-button.
 *
 * The compiler stays filesystem-free: I/O is INJECTED (`read`, `resolve`). This module
 * only reads the links off the AST and walks them.
 */

import { parseDocument, type AtConstructParser, type ElementNode } from '../html/index.js';
import { parseControl } from '../control/index.js';
import { parseCodeBlock } from '../code/index.js';
import { parseDirective } from '../layout/index.js';
import {
  structureDocument,
  type StructuredDocument,
  type ComponentDocument,
  type LayoutDocument,
  type RouteDocument,
} from '../document/index.js';
import { type Diagnostic, errorDiag, warningDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

/** A cycle in the layout chain (decision 87). */
const FUD_LAYOUT_CYCLE = 'FUD0422';
/** A file used as a layout that holds no `@RenderBody()` (decision 82). */
const FUD_NO_RENDER_BODY = 'FUD0423';
/** A `@section` no `@RenderSection` in the chain consumes: its content would vanish. */
const FUD_ORPHAN_SECTION = 'FUD0429';
/** `<link rel="layout">` pointing at a file that is not a layout (decision 82). */
const FUD_NOT_A_LAYOUT = 'FUD0435';

/** Host filesystem, injected so the compiler never touches `node:fs`/`node:path`. */
export interface ResolveIo {
  /** Read a `.fud` file's text by absolute path. */
  read(path: string): string;
  /** Resolve an `href` written in `fromPath` to an absolute path. */
  resolve(fromPath: string, href: string): string;
}

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
  readonly entrySource: string;
  /** The `href`s the entry links directly. */
  readonly entryDeps: readonly string[];
  /** Every component reachable from the entry, keyed by tag. */
  readonly components: ReadonlyMap<string, ResolvedComponent>;
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

/** Resolve the transitive component graph from an entry `.fud` (page or component). */
export function resolveComponents(entryPath: string, io: ResolveIo): ComponentGraph {
  const entrySource = io.read(entryPath);
  const entry = parse(entrySource).value;
  const components = new Map<string, ResolvedComponent>();
  visitComponents(entry.links, entryPath, io, components);
  const entryDeps = entry.links.map(linkHref).filter((h): h is string => h !== undefined);
  return { entry, entryPath, entrySource, entryDeps, components };
}

/** Walk the `<link rel="component">` graph from `links`, filling `components` by tag. */
function visitComponents(
  links: readonly ElementNode[],
  fromPath: string,
  io: ResolveIo,
  components: Map<string, ResolvedComponent>,
): void {
  const visit = (path: string): void => {
    const source = io.read(path);
    const doc = parse(source).value;
    if (doc.type !== 'component-document') return; // a linked file must be a component
    if (components.has(doc.name)) return; // already resolved (shared dependency)
    const deps = doc.links.map(linkHref).filter((h): h is string => h !== undefined);
    components.set(doc.name, { tag: doc.name, path, source, doc, deps });
    for (const href of deps) visit(io.resolve(path, href));
  };
  for (const href of links.map(linkHref)) {
    if (href !== undefined) visit(io.resolve(fromPath, href));
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
  /** The specifier of its own parent layout, when it has one (decision 87). */
  readonly parentHref?: string;
}

/**
 * The entry plus its layout chain and every component either of them reaches. Extends
 * `ComponentGraph`, so every consumer of the component-only graph keeps working.
 */
export interface DocumentGraph extends ComponentGraph {
  /** The layout chain of the entry, INNERMOST FIRST. Empty for a page/component entry. */
  readonly layouts: readonly ResolvedLayout[];
}

/** The layout href a document declares, or undefined when it declares none. */
function layoutHrefOf(doc: StructuredDocument): string | undefined {
  if (doc.type === 'route-document') return doc.layoutHref === '' ? undefined : doc.layoutHref;
  if (doc.type === 'layout-document') return doc.layoutHref;
  return undefined;
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
  const entrySource = io.read(entryPath);
  const parsedEntry = parse(entrySource);
  // The entry's OWN syntax errors, first because they come first in the file. Only the
  // entry's: a dependency's spans are offsets into a different file, and every dependency
  // — component or layout — is a module of its own that comes back through here, so its
  // diagnostics surface against its own source instead of being reported on this one.
  const diagnostics: Diagnostic[] = [...parsedEntry.diagnostics];
  const entry = parsedEntry.value;
  const components = new Map<string, ResolvedComponent>();
  const layouts: ResolvedLayout[] = [];

  const seen = new Set<string>([entryPath]);
  let fromPath = entryPath;
  let fromDoc: StructuredDocument = entry;
  let href = layoutHrefOf(entry);
  while (href !== undefined) {
    const path = io.resolve(fromPath, href);
    const at = (fromDoc.type === 'route-document' || fromDoc.type === 'layout-document'
      ? fromDoc.layoutLink?.span
      : undefined) ?? fromDoc.span;
    if (seen.has(path)) {
      diagnostics.push(errorDiag(FUD_LAYOUT_CYCLE, `layout cycle: ${path} is already in the chain`, at));
      break;
    }
    seen.add(path);

    const source = io.read(path);
    const doc = parse(source).value;
    if (doc.type !== 'layout-document') {
      // A shell with no `@RenderBody()` structures as a page: it was MEANT to be a layout
      // (something points at it), so name the missing directive rather than the role.
      diagnostics.push(
        doc.type === 'page-document'
          ? errorDiag(FUD_NO_RENDER_BODY, `a layout must contain @RenderBody(): ${path}`, at)
          : errorDiag(FUD_NOT_A_LAYOUT, `<link rel="layout"> must point at a layout: ${path}`, at),
      );
      break;
    }

    const deps = doc.links.map(linkHref).filter((h): h is string => h !== undefined);
    const parentHref = doc.layoutHref;
    layouts.push({
      path,
      source,
      doc,
      deps,
      ...(parentHref !== undefined ? { parentHref } : {}),
    });

    fromPath = path;
    fromDoc = doc;
    href = parentHref;
  }

  // Components are collected OUTERMOST LAYOUT FIRST and the entry last, so the order of
  // the emitted `<style type="module">` block matches the head cascade of decision 88 —
  // and therefore matches the equivalent monolithic page.
  for (const layout of [...layouts].reverse()) {
    visitComponents(layout.doc.links, layout.path, io, components);
  }
  visitComponents(entry.links, entryPath, io, components);

  reportOrphanSections(entry, layouts, diagnostics);

  const entryDeps = entry.links.map(linkHref).filter((h): h is string => h !== undefined);
  const graph: DocumentGraph = { entry, entryPath, entrySource, entryDeps, components, layouts };
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
