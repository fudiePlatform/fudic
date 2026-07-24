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
import { structureDocument, type StructuredDocument, type ComponentDocument } from '../document/index.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

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
  readonly entrySource: string;
  /** The `href`s the entry links directly. */
  readonly entryDeps: readonly string[];
  /** Every component reachable from the entry, keyed by tag. */
  readonly components: ReadonlyMap<string, ResolvedComponent>;
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

function parse(source: string): StructuredDocument {
  return structureDocument(source, parseDocument(source, { atConstructs: constructs }).value).value;
}

/** Resolve the transitive component graph from an entry `.fud` (page or component). */
export function resolveComponents(entryPath: string, io: ResolveIo): ComponentGraph {
  const entrySource = io.read(entryPath);
  const entry = parse(entrySource);
  const components = new Map<string, ResolvedComponent>();

  const visit = (path: string): void => {
    const source = io.read(path);
    const doc = parse(source);
    if (doc.type !== 'component-document') return; // a linked file must be a component
    if (components.has(doc.name)) return; // already resolved (shared dependency)
    const deps = doc.links.map(linkHref).filter((h): h is string => h !== undefined);
    components.set(doc.name, { tag: doc.name, path, source, doc, deps });
    for (const href of deps) visit(io.resolve(path, href));
  };

  const entryDeps = entry.links.map(linkHref).filter((h): h is string => h !== undefined);
  for (const href of entryDeps) visit(io.resolve(entryPath, href));

  return { entry, entrySource, entryDeps, components };
}
