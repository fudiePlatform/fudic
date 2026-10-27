/**
 * The snippet catalogue (SDD-28).
 *
 * Half the value of a snippet is the GATE, not the body: `@if` belongs in markup and not
 * inside `@code`, where `if` is TypeScript and TypeScript offers it; `@RenderBody()` belongs
 * in a layout and is `FUD0432` in a route; a document skeleton belongs in a file that has
 * nothing in it yet. That is why this lives in the server and not in a static snippet file of
 * the extension, which would offer everything everywhere and in VS Code only.
 *
 * Pure. Which snippets apply is a question about an offset and a parsed document; turning one
 * into a `CompletionItem` is the plugin's job.
 */

import { documentRoots, walk, type ElementNode } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import { isUndecided, roleOf, type FudRole } from '../mode.js';
import { isEmptyDocument } from './position.js';
import { isMarkupOffset } from './emmet.js';

/** Where a snippet may be offered. The three are exclusive and decided by offset. */
export type SnippetScope =
  /** The file has nothing in it yet: the only place a whole document may be inserted. */
  | 'empty-document'
  /** Element content — not a `<style>` body, not an interpolation, not `@code`. */
  | 'markup'
  /** Inside the `@code` block, where the language is TypeScript. */
  | 'code-block';

/**
 * The scope of an offset, or nothing when it is none of the three.
 *
 * `empty-document` is asked first and answers for every offset of an empty file: with no
 * content there is no markup and no `@code`, and the four skeletons are the only sensible
 * answer anywhere in it.
 *
 * The fourth case — the body of a `<style>` or a `<script>`, and the inside of an
 * interpolation — is deliberately none of them. It is CSS or an expression, and neither
 * wants a `@foreach`.
 */
export function scopeAt(document: CachedDocument, offset: number): SnippetScope | undefined {
  if (isEmptyDocument(document.source)) return 'empty-document';

  const code = document.document.code;
  if (code !== undefined && offset >= code.span.start && offset <= code.span.end) {
    return 'code-block';
  }
  return isMarkupOffset(document, offset) ? 'markup' : undefined;
}

/**
 * Where a construct is allowed to sit, for the ones that cannot sit anywhere.
 *
 * A `@code` block and a `@section` are top-level nodes of their document (decisions 53, 83
 * and `FUD0155`/`FUD0153`/"@section must be a top-level node of the route"), and in a page or
 * a layout `@code` lives inside `<head>` (decision 59/60). Offering them in the middle of the
 * body would scaffold a file that is red the moment it lands, which is worse than not
 * offering them at all.
 *
 * `outside-head` is the mirror of that, and it is the control constructs': a `<head>` is a list
 * of declarations, not a template — nobody loops over `<meta>` or branches on a `<title>` — so
 * a `@foreach` offered there is noise in front of the two names the author is actually after.
 */
export type SnippetPlacement = 'top-level' | 'in-head' | 'outside-head';

/**
 * The innermost element whose CONTENT contains this offset, if any.
 *
 * An element with no closing tag — `<meta>`, `<link>` — has no content, so it can never be
 * what an offset is inside of, and it is skipped rather than given an empty range.
 *
 * The last match wins, and that is not an arbitrary choice: `walk` is pre-order, so of two
 * elements that both contain the offset the deeper one is always visited second.
 */
function innermostElementAt(document: CachedDocument, offset: number): ElementNode | undefined {
  let found: ElementNode | undefined;
  walk(documentRoots(document.document), {
    element: (element) => {
      const close = element.closeSpan;
      if (close === undefined) return;
      if (offset >= element.openSpan.end && offset <= close.start) found = element;
    },
  });
  return found;
}

/**
 * Whether this offset is inside a `<head>`, however deep.
 *
 * The ANCESTOR, not the innermost element: `<title>@|</title>` is in the head as much as the
 * gap between two `<meta>`s is, and it is the position where this matters.
 */
function insideHead(document: CachedDocument, offset: number): boolean {
  let found = false;
  walk(documentRoots(document.document), {
    element: (element) => {
      const close = element.closeSpan;
      if (close === undefined || element.name !== 'head') return;
      if (offset >= element.openSpan.end && offset <= close.start) found = true;
    },
  });
  return found;
}

/**
 * Whether only whitespace separates this offset from the closing `}` of a loop with no
 * `@empty` yet. A loop's span ends just past that brace, and the `@` being typed is not part
 * of it: a half-written `@em` parses as an expression of its own, after the loop.
 */
function followsLoop(document: CachedDocument, offset: number): boolean {
  let found = false;
  walk(documentRoots(document.document), {
    control: (node) => {
      if (node.type !== 'foreach' && node.type !== 'for' && node.type !== 'while') return;
      if (node.empty !== undefined || node.span.end > offset) return;
      const end = node.span.end;
      if (document.source[end - 1] === '}' && document.source.slice(end, offset).trim() === '') found = true;
    },
  });
  return found;
}

/** Whether this offset satisfies a placement. */
function placedAt(document: CachedDocument, offset: number, placement: SnippetPlacement): boolean {
  if (placement === 'outside-head') return !insideHead(document, offset);

  const element = innermostElementAt(document, offset);
  if (placement === 'top-level') return element === undefined;
  return element !== undefined && element.name === 'head';
}

/** The roles whose markup is a template with a client half: every one but the layout. */
const MARKUP_ROLES: readonly FudRole[] = ['component', 'route', 'page'];

/** The roles that branch and loop in their markup: the layout's body too, since SDD-48. */
const CONTROL_ROLES: readonly FudRole[] = [...MARKUP_ROLES, 'layout'];

/** One entry of the catalogue. */
export interface FudSnippet {
  /** What is typed and what is shown. */
  readonly label: string;
  readonly detail: string;
  /** LSP snippet syntax: `$0`, `${1:x}`. Every `$` here belongs to a tabstop. */
  readonly body: string;
  readonly scope: SnippetScope;
  /** The roles it applies to. Absent means all of them. */
  readonly roles?: readonly FudRole[];
  /** Only while the document has no `@code` yet — SDD-10 allows exactly one. */
  readonly requiresNoCodeBlock?: true;
  /** Where it is legal. Absent means anywhere the scope allows. */
  readonly placement?: SnippetPlacement;
  /** Only in a file that may still become a route (`isUndecided`). */
  readonly requiresUndecided?: true;
  /** Only in a file that has a snippet to render: it declares one or links a file of them. */
  readonly requiresSnippets?: true;
  /** Only right after the `}` of a loop that has no `@empty` yet (decision 163). */
  readonly requiresLoopBefore?: true;
  /**
   * Whether accepting it opens the next list at once: its last tabstop is a position the
   * server completes, and the author should not have to ask twice.
   */
  readonly suggest?: true;
}

// ── The document skeletons ────────────────────────────────────────────────────
//
// These four are NOT written here twice over. They are what `renderTemplate` produces from
// the CLI's own `templates/*.fud` when the placeholders are given tabstops as their values,
// and `snippets-templates.test.ts` compares them byte for byte. `fudic g component` and this
// snippet have to hand over the same file, or the project has two ideas of what a component
// is. They are constants rather than a call because the server ships as a single bundle: a
// `readFileSync` at runtime would need the templates vendored, and would fail silently.
//
// A placeholder that appears twice in a template gets ONE tabstop, so the editor mirrors it:
// typing the title once writes it in both places. That is the point, not a side effect.

/**
 * The component skeleton, with the tag the project PROPOSES in its tabstop (SDD-41 §4.4).
 *
 * It used to carry `app-button` written into this file. Now the proposal comes from the
 * project, and `app-button` is only what a project that declares no prefix still gets. It
 * remains a tabstop: what the user types over it wins, and nothing ever checks that a
 * component's tag carries the prefix.
 */
export function componentSkeleton(tag: string): string {
  return COMPONENT_SKELETON.replaceAll('app-button', tag);
}

const COMPONENT_SKELETON = `<head>
  <style></style>
</head>

<\${1:app-button}>
  <template shadowrootmode="open">
    $0
  </template>
</\${1:app-button}>
`;

const ROUTE_SKELETON = `<link rel="layout" href="\${1:../layouts/_layout.fud}">

<head>
  <title>\${2:Untitled}</title>
</head>

<h1>\${2:Untitled}</h1>
`;

const PAGE_SKELETON = `<!DOCTYPE html>
<html lang="\${1:en}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script type="module" src="fudic:runtime"></script>
    <title>\${2:Home}</title>

  </head>
  <body>
    <h1>\${2:Home}</h1>
  </body>
</html>
`;

const LAYOUT_SKELETON = `<!DOCTYPE html>
<html lang="\${1:en}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    @* Keep this line: fudic puts its scripts here. *@
    <script type="module" src="fudic:runtime"></script>
    @RenderHead()
  </head>
  <body>
    @RenderSection(\${2:nav})

    <main>@RenderBody()</main>
  </body>
</html>
`;

// ── The `@code` block, by role ────────────────────────────────────────────────
//
// Three bodies for one label, over disjoint roles. A component wants its props; a route and a
// page, an empty block — what feeds them is the `load` of their `.fudapi` (SDD-60 §3.4); a
// LAYOUT wants its props and nothing else — declaring them is all its `@code` may do
// (`FUD0700`), and the route is who resolves them.

const COMPONENT_CODE = `@code {
  type \${1:Props} = {
    $2
  };

  const {} = props<\${1:Props}>();
  $0
}`;

const CODE = `@code {
  $0
}`;

const PROPS = `type \${1:Props} = {
  $2
};

const {} = props<\${1:Props}>();`;

const LAYOUT_CODE = `@code {
  type \${1:Props} = {
    $2
  };

  const {} = props<\${1:Props}>();
}`;

/** A `<link>` of this `rel`, with the caret inside its `href`. */
const LINK = (rel: string): string => `<link rel="${rel}" href="$0">`;

/** The link snippet of one `rel`, placed where each role keeps its links. */
function linkSnippets(rel: 'component' | 'snippet', detail: string): readonly FudSnippet[] {
  const label = `link-${rel}`;
  const body = LINK(rel);
  return [
    { label, detail, scope: 'markup', body, roles: ['component', 'route'], placement: 'top-level', suggest: true },
    { label, detail, scope: 'markup', body, roles: ['page', 'layout'], placement: 'in-head', suggest: true },
  ];
}

/** The catalogue, in the order it is offered. */
export const SNIPPETS: readonly FudSnippet[] = [
  // Skeletons: only ever in a file with nothing in it.
  { label: 'component', detail: 'fudic component', body: COMPONENT_SKELETON, scope: 'empty-document' },
  { label: 'route', detail: 'fudic route with a layout', body: ROUTE_SKELETON, scope: 'empty-document' },
  { label: 'page', detail: 'fudic standalone page', body: PAGE_SKELETON, scope: 'empty-document' },
  { label: 'layout', detail: 'fudic layout', body: LAYOUT_SKELETON, scope: 'empty-document' },

  // Control flow: markup, never inside a `<head>` — see `outside-head` — and never in a
  // LAYOUT, which renders holes rather than data: what a `@` opens there is one of the three
  // `@Render*` and nothing else. `else` carries no `@` (SDD-06 §4.2), and `@switch` has no
  // fall-through and no braces per case (decision 14).
  {
    label: '@if',
    detail: 'conditional',
    scope: 'markup',
    body: '@if (${1:condition}) {\n  $0\n}',
    roles: CONTROL_ROLES,
    placement: 'outside-head',
  },
  {
    label: '@if else',
    detail: 'conditional with an else branch',
    scope: 'markup',
    body: '@if (${1:condition}) {\n  $2\n} else {\n  $0\n}',
    roles: CONTROL_ROLES,
    placement: 'outside-head',
  },
  // The three loops carry their `key (…)`, and not as decoration: a loop that renders markup
  // must declare one (decision 91, `FUD0540`), so a snippet without it hands over a file that
  // is red the moment the user types the first row inside it. The name of the item is ONE
  // tabstop across the header and the key, so renaming it there renames it in both.
  {
    label: '@foreach',
    detail: 'declarative iteration (decisions 11, 91)',
    scope: 'markup',
    body: '@foreach (const ${1:item} of ${2:items}) key (${1:item}.${3:id}) {\n  $0\n}',
    roles: CONTROL_ROLES,
    placement: 'outside-head',
  },
  {
    label: '@for',
    detail: 'iteration with an index (decisions 11, 91)',
    scope: 'markup',
    body: '@for (let ${1:i} = 0; ${1:i} < ${2:items}.length; ${1:i}++) key (${1:i}) {\n  $0\n}',
    roles: CONTROL_ROLES,
    placement: 'outside-head',
  },
  {
    label: '@while',
    detail: 'loop (decision 91)',
    scope: 'markup',
    body: '@while (${1:condition}) key (${2:id}) {\n  $0\n}',
    roles: CONTROL_ROLES,
    placement: 'outside-head',
  },
  // What a loop renders when it makes no pass. Only where it can go: right after the body of
  // a loop that has none yet — anywhere else it is `FUD1149`.
  {
    label: '@empty',
    detail: 'what the loop renders when it makes no pass (decision 163)',
    scope: 'markup',
    body: '@empty {\n  $0\n}',
    roles: CONTROL_ROLES,
    requiresLoopBefore: true,
  },
  {
    label: '@switch',
    detail: 'multi-way branch, no fall-through (decision 14)',
    scope: 'markup',
    body: "@switch (${1:value}) {\n  case ${2:'a'}:\n    $0\n  default:\n}",
    roles: CONTROL_ROLES,
    placement: 'outside-head',
  },

  // The `@code` block itself, while there is not one already, and only where one is legal:
  // top-level in a component and in a route (decisions 53, 83), inside `<head>` in a page and
  // in a layout (59).
  {
    label: '@code',
    detail: 'props and the browser code',
    scope: 'markup',
    body: COMPONENT_CODE,
    roles: ['component'],
    requiresNoCodeBlock: true,
    placement: 'top-level',
  },
  {
    label: '@code',
    detail: 'the browser code of this route',
    scope: 'markup',
    body: CODE,
    roles: ['route'],
    requiresNoCodeBlock: true,
    placement: 'top-level',
  },
  {
    label: '@code',
    detail: 'the browser code of this page',
    scope: 'markup',
    body: CODE,
    roles: ['page'],
    requiresNoCodeBlock: true,
    placement: 'in-head',
  },
  {
    label: '@code',
    detail: 'the props this layout asks its routes for',
    scope: 'markup',
    body: LAYOUT_CODE,
    roles: ['layout'],
    requiresNoCodeBlock: true,
    placement: 'in-head',
  },

  // The three `<link>` fudic reads, each one ending inside its `href` with the list of what it
  // can link already open. Top-level where a file's links live, in `<head>` in a page or a
  // layout (decision 59). `link-layout` only where a layout can still be named: a route has
  // its one already — it is how the file became a route — and nothing else takes one.
  ...linkSnippets('component', 'import a component'),
  ...linkSnippets('snippet', 'import the snippets of a file'),
  {
    label: 'link-layout',
    detail: 'the layout this route renders inside',
    scope: 'markup',
    body: LINK('layout'),
    placement: 'top-level',
    requiresUndecided: true,
    suggest: true,
  },

  // `@render`, wherever markup is written and there is a snippet to render. Accepting it opens
  // the names the projection has in scope — local, imported and namespaced.
  {
    label: '@render',
    detail: 'render a snippet (SDD-29)',
    scope: 'markup',
    roles: [...CONTROL_ROLES, 'snippet'],
    body: '@render $0',
    placement: 'outside-head',
    requiresSnippets: true,
    suggest: true,
  },

  // Directives, each one only where it is legal: `@RenderHead()` in the head (`FUD0431`), and
  // the two holes a route fills in the body.
  {
    label: '@RenderBody',
    detail: 'where the route body goes',
    scope: 'markup',
    roles: ['layout'],
    // The caret stays inside, and the list opens: inside a component its slots are what is
    // written there next (SDD-48); anywhere else the list is empty and `)` closes it.
    body: '@RenderBody($0)',
    placement: 'outside-head',
    suggest: true,
  },
  {
    label: '@RenderHead',
    detail: 'where each route contributes to the head',
    scope: 'markup',
    roles: ['layout'],
    body: '@RenderHead()',
    placement: 'in-head',
  },
  {
    label: '@RenderSection',
    detail: 'a hole a route may fill (decision 85)',
    scope: 'markup',
    roles: ['layout'],
    body: '@RenderSection(${1:nav})',
    placement: 'outside-head',
  },
  {
    label: '@section',
    detail: 'fill a hole of the layout (decision 84)',
    scope: 'markup',
    roles: ['route'],
    body: '@section ${1:nav} {\n  $0\n}',
    placement: 'top-level',
  },

  // Inside `@code` the language is TypeScript, so nothing of markup applies. The `@code` is
  // browser code, all of it (SDD-60 §4.8): what the server runs — `load`, `paths`, `layout` —
  // is declared in a `.fudapi`.
  { label: 'props', detail: 'the props contract of this component', scope: 'code-block', roles: ['component'], body: PROPS },
  { label: 'props', detail: 'the props this layout asks its routes for', scope: 'code-block', roles: ['layout'], body: PROPS },
];

/**
 * The snippets that apply at this offset.
 *
 * Six filters and nothing else: the scope, the role of the document, whether a `@code` block
 * is already there, where the construct is allowed to sit, whether the file may still become a
 * route, and whether it has a snippet to render. In an empty file the role is `component` —
 * that is what an empty `.fud` structures as — but the skeletons declare no roles, so all four
 * are offered.
 */
export function snippetsAt(
  document: CachedDocument,
  offset: number,
  componentTag = 'app-button',
): readonly FudSnippet[] {
  const scope = scopeAt(document, offset);
  if (scope === undefined) return [];

  const role = roleOf(document.document);
  const code = document.document.code;

  return SNIPPETS.filter(
    (snippet) =>
      snippet.scope === scope &&
      (snippet.roles === undefined || snippet.roles.includes(role)) &&
      (snippet.requiresNoCodeBlock === undefined || code === undefined) &&
      (snippet.placement === undefined || placedAt(document, offset, snippet.placement)) &&
      (snippet.requiresUndecided === undefined || isUndecided(document.document)) &&
      (snippet.requiresSnippets === undefined ||
        document.document.snippets.length + document.document.snippetLinks.length > 0) &&
      (snippet.requiresLoopBefore === undefined || followsLoop(document, offset)),
  ).map((snippet) =>
    snippet.label === 'component' ? { ...snippet, body: componentSkeleton(componentTag) } : snippet,
  );
}
