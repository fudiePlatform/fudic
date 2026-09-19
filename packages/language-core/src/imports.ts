/**
 * Synthetic imports: the contracts of the components and the layout this file uses
 * (SDD-23 §4.4).
 *
 *     <link rel="component" href="./app-badge.fud">  →  import type { $Props as $C0, $Slots as $S0 } from './app-badge.fud';
 *     <link rel="layout" href="./_layout.fud">       →  import type { $Sections as $L0 } from './_layout.fud';
 *
 * `import type` and nothing else: the projection must never pull a value into the program
 * it is checking. Every alias lives in the `$` namespace reserved to the compiler, so it
 * cannot collide with the verbatim user code sitting beside it.
 *
 * A tag with no `<link>` gets an alias too — but no import. The undeclared name is the
 * point: `<app-missing>` becomes `$attrs<$C_app_missing>({…})` and TypeScript reports
 * `TS2304` on the tag, which is decision 41 enforced by the checker instead of by a rule
 * of ours.
 */

import type {
  ElementNode,
  ForNode,
  ForeachNode,
  HtmlContent,
  IfNode,
  SectionNode,
  SnippetDeclNode,
  StructuredDocument,
  SwitchNode,
  WhileNode,
} from '@fudic/compiler';
import { componentModuleSpecifier } from './paths.js';
import type { SnippetAliases } from './template/snippets.js';
import type { FileRegistry } from './types.js';
import type { VirtualWriter } from './writer.js';

/** Alias of the layout's section union, when the file declares a layout. */
export const LAYOUT_ALIAS = '$L0';

/** How a projected file names the contracts it uses. */
export interface Aliases {
  /** The type name a tag is projected as. Always defined; only registered tags are imported. */
  aliasOf(tag: string): string;
  /**
   * The alias of a tag's slot union, or `undefined` when the tag has no `<link>`.
   *
   * Undefined rather than an undeclared name on purpose (BUG-11 §4.4): an unregistered tag
   * already fails with `TS2304` on its name, and a second error about its slots on the very
   * same tag adds no information.
   */
  slotsAliasOf(tag: string): string | undefined;
  /** `$L0` when a layout was imported, `undefined` otherwise. */
  readonly layout: string | undefined;
}

/**
 * Emit the `import type` preamble and return the alias table the template will use.
 *
 * Aliases are numbered in the order the tags appear in the markup, not in the order the
 * `<link>`s were written: the emission must depend only on the AST, and a link the file
 * declares but never uses adds an import nobody reads.
 */
export function emitImports(
  w: VirtualWriter,
  content: readonly HtmlContent[],
  registry: FileRegistry,
): Aliases {
  const aliases = new Map<string, string>();

  const layoutHref = registry.layout();
  if (layoutHref !== undefined) {
    w.scaffold(
      `import type { $Sections as ${LAYOUT_ALIAS} } from '${componentModuleSpecifier(layoutHref)}';\n`,
    );
  }

  for (const tag of collectTags(content)) {
    const href = registry.component(tag);
    if (href === undefined) continue;
    // One number for both contracts, so `$C0` and `$S0` are always the same component.
    const n = aliases.size;
    aliases.set(tag, `$C${n}`);
    w.scaffold(
      `import type { $Props as $C${n}, $Slots as $S${n} } from '${componentModuleSpecifier(href)}';\n`,
    );
  }

  return {
    aliasOf: (tag) => aliases.get(tag) ?? unresolvedAlias(tag),
    slotsAliasOf: (tag) => {
      const alias = aliases.get(tag);
      return alias === undefined ? undefined : `$S${alias.slice(2)}`;
    },
    layout: layoutHref === undefined ? undefined : LAYOUT_ALIAS,
  };
}

/** The merged namespace of every import written without an `as`. */
const GLOBAL_SNIPPETS = '$snippets';

/**
 * The `import * as` preamble of this file's `<link rel="snippet">`, and how a `@render`
 * names what it calls (SDD-29 §4.11).
 *
 * One namespace per FILE, because that is the grain of the import: a link brings in every
 * declaration of the file it names, and which those are is a question for the TypeScript
 * program rather than for a registry of ours.
 *
 * The links written WITHOUT an `as` are merged into one object, so `@render card(…)` resolves
 * to whichever of them declares `card` without this projection having to know which — and
 * that is exactly what the global scope of §4.3 is. Two files that both declare it is
 * `FUD0834`, said once, where the author can act on it.
 */
export function emitSnippetImports(
  w: VirtualWriter,
  doc: StructuredDocument,
  registry: FileRegistry,
): SnippetAliases {
  const local = new Set(doc.snippets.map((s) => s.name));
  const byNamespace = new Map<string, string>();
  const global: string[] = [];

  registry.snippets().forEach((imported, i) => {
    const alias = `$Sn${i}`;
    w.scaffold(`import * as ${alias} from '${componentModuleSpecifier(imported.href)}';\n`);
    const namespace = imported.namespace?.name;
    if (namespace === undefined) global.push(alias);
    // A repeated `as` is the author naming two files the same: the first wins, and the
    // second is an unreachable namespace — which is a rule for a diagnostic, not for here.
    else if (!byNamespace.has(namespace)) byNamespace.set(namespace, alias);
  });

  if (global.length > 0) {
    w.scaffold(`const ${GLOBAL_SNIPPETS} = { ${global.map((a) => `...${a}`).join(', ')} };\n`);
  }

  return {
    aliasFor: (namespace, name) => {
      if (namespace !== undefined) return byNamespace.get(namespace);
      // A snippet this file declares is a function in this file: the bare name IS the call,
      // and it is what makes go-to-definition land on the declaration a line above.
      if (local.has(name) || global.length === 0) return undefined;
      return GLOBAL_SNIPPETS;
    },
  };
}

/**
 * The alias of a tag with no `<link>`: `app-missing` → `$C_app_missing`.
 *
 * Deliberately never declared. The hyphen a custom element must have (decision 41) is not
 * a valid identifier character, so the substitution also guarantees the name cannot
 * accidentally match anything the user declared.
 */
export function unresolvedAlias(tag: string): string {
  return `$C_${tag.replace(/[^\p{ID_Continue}]/gu, '_')}`;
}

/** Every custom-element tag used in the markup, in source order, without duplicates. */
export function collectTags(content: readonly HtmlContent[]): readonly string[] {
  const tags = new Set<string>();
  walk(content, tags);
  return [...tags];
}

function walk(content: readonly HtmlContent[], out: Set<string>): void {
  for (const node of content) {
    if (node.type === 'element') {
      if (node.name.includes('-')) out.add(node.name);
      walk(node.children, out);
      continue;
    }
    // Control constructs and sections host markup too; a component used only inside an
    // `@if` still needs its contract imported.
    for (const nested of nestedContent(node)) walk(nested, out);
  }
}

/**
 * The markup a non-element node hosts, in source order: control bodies, switch cases,
 * section children.
 *
 * Dispatched on the discriminant rather than by probing field names, so the order is the
 * one the user wrote — an `@if`'s arms before its `else` — and the aliases they produce are
 * numbered the way the file reads.
 */
export function nestedContent(node: HtmlContent): readonly (readonly HtmlContent[])[] {
  switch (node.type) {
    case 'if': {
      const it = node as IfNode;
      const bodies = it.branches.map((b) => b.body);
      return it.elseBody === undefined ? bodies : [...bodies, it.elseBody];
    }
    case 'foreach':
    case 'for':
    case 'while':
      return [(node as ForeachNode | ForNode | WhileNode).body];
    case 'switch':
      return (node as SwitchNode).cases.map((c) => c.body);
    case 'section':
      return [(node as SectionNode).children];
    case 'snippet':
      // A declaration hosts markup too, and the tags inside it are resolved against THIS
      // file's links: leaving them out would be a hole in the editor exactly where the
      // author is typing.
      return [(node as SnippetDeclNode).children];
    default:
      return [];
  }
}

/**
 * The `<head>`, projected like the markup it is.
 *
 * Nobody writes a web component in a head, so nothing here is about tags or props: it is about
 * the `@`. A `<title>@data.title</title>` and a `<link rel="preload" href="@data.hero">` read
 * from the same scope as anything in the body, and until now neither of them mapped anywhere —
 * the head was left out of the projection entirely, so `<title>@|</title>` heard only the
 * server's own snippets while the identical `@` one element lower answered with `data`, the
 * props and every name of `@client`.
 *
 * Whole children rather than a chosen few, because choosing is what left the gap. The head's
 * elements are native, so `emitNativeAttrs` projects exactly their interpolations and nothing
 * else — a `<meta charset="utf-8">` produces no line at all — and `<style>` and `<script>` are
 * opaque here as everywhere. There is no `$attrs` literal to make `charset` a `TS2353`.
 */
function headContent(head: ElementNode | undefined): readonly HtmlContent[] {
  return head === undefined ? [] : head.children;
}

/**
 * The `@snippet` declarations a file holds, which the projection needs like any other markup.
 *
 * A snippet body is markup of THIS file: the tags it instantiates are resolved against this
 * file's links, and leaving it out would be a hole in the editor exactly where the author is
 * typing — completion, hover and prop checking would stop at the opening brace. The
 * declarations themselves are what the projection turns into functions (SDD-29 §4.11), so it
 * takes the NODES and not their children.
 */
function snippetDecls(doc: StructuredDocument): readonly HtmlContent[] {
  return doc.snippets;
}

/** The markup a structured document exposes to the template projection. */
export function templateContent(doc: StructuredDocument): readonly HtmlContent[] {
  switch (doc.type) {
    case 'component-document':
      return [...headContent(doc.head), ...(doc.template?.children ?? []), ...snippetDecls(doc)];
    case 'route-document':
      // The structuring pass lifts `@section` blocks out of the markup into their own
      // field; the projection needs both, or a component used only inside a section would
      // never get its contract imported.
      return [...headContent(doc.head), ...doc.markup, ...doc.sections, ...snippetDecls(doc)];
    case 'snippet-document':
      // A file of snippets IS its declarations: no head, no body, no host.
      return snippetDecls(doc);
    default:
      // Source order: a page writes its head before its body, and the projection reads the
      // same way round. A shell declares its snippets in its `<head>`, so they are already
      // in `headContent` and are not added twice.
      return [...headContent(doc.head), ...doc.body.children];
  }
}
