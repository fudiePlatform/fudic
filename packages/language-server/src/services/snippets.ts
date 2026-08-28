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

import { documentRoots, walk, type CodeBlockNode, type ElementNode } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import { roleOf, type FudRole } from '../mode.js';
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

/** Whether this offset satisfies a placement. */
function placedAt(document: CachedDocument, offset: number, placement: SnippetPlacement): boolean {
  if (placement === 'outside-head') return !insideHead(document, offset);

  const element = innermostElementAt(document, offset);
  if (placement === 'top-level') return element === undefined;
  return element !== undefined && element.name === 'head';
}

/** The roles whose markup is a template: every one but the layout. */
const MARKUP_ROLES: readonly FudRole[] = ['component', 'route', 'page'];

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
  /**
   * Only while the `@code` has no region of this audience yet.
   *
   * One `@server` and one `@client` per file, so a `@` inside `@code` offers what is still
   * missing and nothing else. Offering a second `@server` to a file that already has one is
   * offering `FUD0194` — and it is what made the list read as if the block took any number.
   */
  readonly requiresNoZone?: 'server' | 'client';
  /** Where it is legal. Absent means anywhere the scope allows. */
  readonly placement?: SnippetPlacement;
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

const COMPONENT_SKELETON = `@code {
  type Props = {
  };

  const {} = props<Props>();

  @client {}
}

<head>
  <style></style>
</head>

<\${1:app-button}>
  <template shadowrootmode="open">
    $0
  </template>
</\${1:app-button}>
`;

const ROUTE_SKELETON = `<link rel="layout" href="\${1:../layouts/_layout.fud}">

@code {
  type PageData = { title: string };

  @server {
    export async function load(): Promise<PageData> {
      return { title: 'Untitled' };
    }
  }
}

<head>
  <title>\${2:@data.title}</title>
</head>

<h1>\${2:@data.title}</h1>
`;

const PAGE_SKELETON = `<!DOCTYPE html>
<html lang="\${1:en}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script type="module" src="/fudic-main.js"></script>
    <title>\${2:Home}</title>

    @code {
      type PageData = { title: string };

      @server {
        export async function load(): Promise<PageData> {
          return { title: 'Untitled' };
        }
      }
    }

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

    @* The main-thread bootstrap: it installs the hydration runtime -- always -- and
       registers the render Service Worker when the app was built with one. It lives here,
       once, so no route can forget it. Remove it and the page still paints, and nothing
       ever reacts to a click. *@
    <script type="module" src="/fudic-main.js"></script>

    @* Everything each route contributes to the head — its <title>, its component
       stylesheets, the style-adoption polyfill — is inserted exactly here. *@
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
// Two bodies for one label, over disjoint roles. A component wants its props and its
// `@client`; a route and a page want the `load` that feeds them. A LAYOUT gets none: it has no
// `@code` at all (`FUD0437`) — it owns the shell, declares nothing and loads nothing — so the
// snippet that used to offer it one is gone rather than narrowed.

const COMPONENT_CODE = `@code {
  type \${1:Props} = {
    $2
  };

  const {} = props<\${1:Props}>();

  @client {$0}
}`;

const SERVER_CODE = `@code {
  type \${1:PageData} = { title: string };

  @server {
    export async function load(): Promise<\${1:PageData}> {
      return { title: '\${2:Untitled}' };
    }
  }
}`;

const LOAD = `export async function load(): Promise<\${1:PageData}> {
  $0
}`;

const PROPS = `type \${1:Props} = {
  $2
};

const {} = props<\${1:Props}>();`;

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
    roles: MARKUP_ROLES,
    placement: 'outside-head',
  },
  {
    label: '@if else',
    detail: 'conditional with an else branch',
    scope: 'markup',
    body: '@if (${1:condition}) {\n  $2\n} else {\n  $0\n}',
    roles: MARKUP_ROLES,
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
    roles: MARKUP_ROLES,
    placement: 'outside-head',
  },
  {
    label: '@for',
    detail: 'iteration with an index (decisions 11, 91)',
    scope: 'markup',
    body: '@for (let ${1:i} = 0; ${1:i} < ${2:items}.length; ${1:i}++) key (${1:i}) {\n  $0\n}',
    roles: MARKUP_ROLES,
    placement: 'outside-head',
  },
  {
    label: '@while',
    detail: 'loop (decision 91)',
    scope: 'markup',
    body: '@while (${1:condition}) key (${2:id}) {\n  $0\n}',
    roles: MARKUP_ROLES,
    placement: 'outside-head',
  },
  {
    label: '@switch',
    detail: 'multi-way branch, no fall-through (decision 14)',
    scope: 'markup',
    body: "@switch (${1:value}) {\n  case ${2:'a'}:\n    $0\n  default:\n}",
    roles: MARKUP_ROLES,
    placement: 'outside-head',
  },

  // The `@code` block itself, while there is not one already, and only where one is legal:
  // top-level in a component and in a route (decisions 53, 83), inside `<head>` in a page and
  // in a layout (59).
  {
    label: '@code',
    detail: 'props and the client zone',
    scope: 'markup',
    body: COMPONENT_CODE,
    roles: ['component'],
    requiresNoCodeBlock: true,
    placement: 'top-level',
  },
  {
    label: '@code',
    detail: 'the server load of this route',
    scope: 'markup',
    body: SERVER_CODE,
    roles: ['route'],
    requiresNoCodeBlock: true,
    placement: 'top-level',
  },
  {
    label: '@code',
    detail: 'the server load of this page',
    scope: 'markup',
    body: SERVER_CODE,
    roles: ['page'],
    requiresNoCodeBlock: true,
    placement: 'in-head',
  },

  // Directives, each one only where it is legal.
  { label: '@RenderBody', detail: 'where the route body goes', scope: 'markup', roles: ['layout'], body: '@RenderBody()' },
  { label: '@RenderHead', detail: 'where each route contributes to the head', scope: 'markup', roles: ['layout'], body: '@RenderHead()' },
  {
    label: '@RenderSection',
    detail: 'a hole a route may fill (decision 85)',
    scope: 'markup',
    roles: ['layout'],
    body: '@RenderSection(${1:nav})',
  },
  {
    label: '@section',
    detail: 'fill a hole of the layout (decision 84)',
    scope: 'markup',
    roles: ['route'],
    body: '@section ${1:nav} {\n  $0\n}',
    placement: 'top-level',
  },

  // The zones inside `@code`. Here the language is TypeScript, so nothing of markup applies.
  //
  // Both take the same roles and the same `requiresNoZone`: a `@` inside `@code` opens a
  // region, there is exactly one of each per file (decision 33.b, `FUD0194`), and the one
  // already written is not a candidate. `@client` used to be the component's alone, which was
  // the same rule read backwards — a route that declares a handler needs it as much.
  { label: 'props', detail: 'the props contract of this component', scope: 'code-block', roles: ['component'], body: PROPS },
  {
    label: '@client',
    detail: 'code that runs in the browser',
    scope: 'code-block',
    roles: MARKUP_ROLES,
    body: '@client {\n  $0\n}',
    requiresNoZone: 'client',
  },
  {
    label: '@server',
    detail: 'code that never reaches the browser',
    scope: 'code-block',
    roles: MARKUP_ROLES,
    body: '@server {\n  $0\n}',
    requiresNoZone: 'server',
  },
  { label: 'load', detail: 'the data hook of this page (decision 60)', scope: 'code-block', roles: ['route', 'page'], body: LOAD },
];

/**
 * Whether a `@code` already holds a region of that audience.
 *
 * The BLOCK is the parameter and not the document, because it is always there: `requiresNoZone`
 * lives on `code-block` snippets alone, and the scope is `code-block` exactly when the offset
 * is inside one. Reaching for it through the document again would add a branch that no file
 * can take.
 */
function hasZone(code: CodeBlockNode, zone: 'server' | 'client'): boolean {
  const type = zone === 'server' ? 'server-region' : 'client-region';
  return code.parts.some((part) => part.type === type);
}

/**
 * The snippets that apply at this offset.
 *
 * Five filters and nothing else: the scope, the role of the document, whether a `@code` block
 * is already there, whether the region it would open is already written, and where the
 * construct is allowed to sit. In an empty file the role is `component` — that is what an empty
 * `.fud` structures as — but the skeletons declare no roles, so all four are offered.
 */
export function snippetsAt(document: CachedDocument, offset: number): readonly FudSnippet[] {
  const scope = scopeAt(document, offset);
  if (scope === undefined) return [];

  const role = roleOf(document.document);
  const code = document.document.code;
  // Read once, not per snippet: the two zones are a property of the file, and asking the same
  // question again for `@client` and for `@server` is walking the block twice.
  const written = code === undefined ? [] : (['server', 'client'] as const).filter((z) => hasZone(code, z));

  return SNIPPETS.filter(
    (snippet) =>
      snippet.scope === scope &&
      (snippet.roles === undefined || snippet.roles.includes(role)) &&
      (snippet.requiresNoCodeBlock === undefined || code === undefined) &&
      (snippet.requiresNoZone === undefined || !written.includes(snippet.requiresNoZone)) &&
      (snippet.placement === undefined || placedAt(document, offset, snippet.placement)),
  );
}
