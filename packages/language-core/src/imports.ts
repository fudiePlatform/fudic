/**
 * Synthetic imports: the contracts of the components and the layout this file uses
 * (SDD-23 §4.4).
 *
 *     <link rel="component" href="./app-badge.fud">  →  import type { $Props as $C0 } from './app-badge.fud';
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
  ForNode,
  ForeachNode,
  HtmlContent,
  IfNode,
  SectionNode,
  StructuredDocument,
  SwitchNode,
  WhileNode,
} from '@fudic/compiler';
import { componentModuleSpecifier } from './paths.js';
import type { FileRegistry } from './types.js';
import type { VirtualWriter } from './writer.js';

/** Alias of the layout's section union, when the file declares a layout. */
export const LAYOUT_ALIAS = '$L0';

/** How a projected file names the contracts it uses. */
export interface Aliases {
  /** The type name a tag is projected as. Always defined; only registered tags are imported. */
  aliasOf(tag: string): string;
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
    const alias = `$C${aliases.size}`;
    aliases.set(tag, alias);
    w.scaffold(`import type { $Props as ${alias} } from '${componentModuleSpecifier(href)}';\n`);
  }

  return {
    aliasOf: (tag) => aliases.get(tag) ?? unresolvedAlias(tag),
    layout: layoutHref === undefined ? undefined : LAYOUT_ALIAS,
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
    default:
      return [];
  }
}

/** The markup a structured document exposes to the template projection. */
export function templateContent(doc: StructuredDocument): readonly HtmlContent[] {
  switch (doc.type) {
    case 'component-document':
      return doc.template?.children ?? [];
    case 'route-document':
      // The structuring pass lifts `@section` blocks out of the markup into their own
      // field; the projection needs both, or a component used only inside a section would
      // never get its contract imported.
      return [...doc.markup, ...doc.sections];
    default:
      return doc.body.children;
  }
}
