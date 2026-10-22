/**
 * Page fact extraction (SDD-19 §4.2 inputs). Parses a `.fud` with the compiler and
 * answers the questions the mode resolver needs: is this a page (not a component)?
 * does its `@server` region export `load(ctx)` and/or `paths()`? Those exports are
 * what make a route's data build-known (`load`) and its param space enumerable
 * (`paths`).
 *
 * This is the plugin's bridge to the compiler — the parser hand-written in
 * `@fudic/compiler`, never Vite. The Oxc node access is quarantined behind the same
 * typed helpers the emit uses, so the walk reads as plain code.
 */

import type { LoadDecl } from '@fudic/api';
import {
  JsBatch,
  linkHref,
  readServerFns,
  type CodeBlockNode,
  type Diagnostic,
  type OxcNode,
  type ServerRegion,
  type StructuredDocument,
} from '@fudic/compiler';
import { emptySpan, FUD1010 } from '@fudic/diagnostics';
import { parseFudReporting } from './parse.js';
import { NO_STRATEGY, strategyFrom, strategyOfLoad, type StrategyAnalysis } from './strategy.js';

/**
 * What a route's linked `.fudapi` declares about its page (SDD-60 §3.4, §4.5), as the host reads
 * it: the parser of `@fudic/api`, never Oxc.
 */
export interface PageApi {
  /** `<id>` of the file: its module is `fudic:<id>`. */
  readonly id: string;
  readonly load?: LoadDecl;
  readonly paths: boolean;
  readonly layout: boolean;
}

/** The `.fudapi` an `href` of the page names, or `undefined` when there is none. */
export type PageApiOf = (href: string) => PageApi | undefined;

/** The code of `_error.fud` declaring what it cannot, read off the catalogue. */
const ERROR_PAGE_CODE = FUD1010({ span: emptySpan(0), name: '' }).code;

/**
 * What a `.fud` under `routesDir` IS (SDD-21 §4.7). Only `page` and `route` are routes: a
 * `layout` enters through the `rel="layout"` edge and a `component` through `rel="component"`,
 * exactly as a component under `routesDir` has never been a route.
 */
export type DocumentRole = 'page' | 'route' | 'layout' | 'component';

export interface PageAnalysis {
  readonly role: DocumentRole;
  /** True when the file is a route: a page (doctype) or a route fragment (SDD-21). */
  readonly isPage: boolean;
  /** The `@server` region exports `load(ctx)`. */
  readonly hasLoad: boolean;
  /** The `@server` region exports `paths()`. */
  readonly hasPaths: boolean;
  /**
   * The `@server` region exports `layout(ctx, data)` — the layout props of this render
   * (SDD-40 §3.2).
   *
   * The third reserved name, read off the AST like the other two and for the same reason: an
   * `export function layout` inside a string or a comment exports nothing.
   */
  readonly hasLayout: boolean;
  /**
   * The `@server` region writes the file's level of the chain, `export const http` (SDD-56
   * §3.3). Absent when it does not.
   */
  readonly hasHttp?: true;
  /**
   * `load` is exported as a `const` — the fluent `export const load = get()…handle(…)` of
   * SDD-56 §3.2, which carries its own level of the chain, or an arrow. Which of the two is
   * decided at runtime by `runLoad`; this only says the wrapper must go through it. Absent for
   * `export function load` or no `load`.
   */
  readonly fluentLoad?: true;
  /** The `strategy()` call, read statically (SDD-20 §4.8). */
  readonly strategy: StrategyAnalysis;
  /**
   * The `<id>` of the linked `.fudapi` that declares the page's `load`, `paths` or `layout`
   * (SDD-60 §3.4): the wrapper takes them from the registry, by it. Absent when none does.
   */
  readonly api?: string;
  /** The `href` of `<link rel="layout">`, when the file declares one (SDD-21). */
  readonly layoutHref?: string;
  /**
   * What the parse and the `@server` batch had to say, over this file's text (SDD-35 §4.4).
   * Kept rather than dropped: a route that does not parse is analysed all the same, and the
   * build has to be told why.
   */
  readonly diagnostics: readonly Diagnostic[];
}

// ── Typed access over the untyped Oxc node (quarantined, as in the emit) ──
const is = (node: OxcNode | undefined, type: string): boolean => node?.type === type;
const field = (node: OxcNode, key: string): OxcNode | undefined => node[key] as OxcNode | undefined;
const fieldArray = (node: OxcNode, key: string): OxcNode[] => (node[key] as OxcNode[] | undefined) ?? [];
const nameOf = (node: OxcNode): string => String(node['name']);

/**
 * Analyze a `.fud` source: page vs component, which `@server` hooks it exports, and the
 * strategy it declares. ONE parse and ONE Oxc batch answer all three questions —
 * "Oxc runs exactly once per file" is a repo invariant, not an optimization.
 */
export function analyzePage(source: string, file = '', apiOf?: PageApiOf): PageAnalysis {
  const parsed = parseFudReporting(source);
  const doc = parsed.document;
  const role = roleOf(doc);
  // A ROUTE's link and nothing else. A layout that declares one is `FUD0439`: a mistake to
  // delete, not a relation — counting it as «this layout is used» would keep a layout alive
  // on the strength of a link the author has to remove anyway.
  const layoutHref = doc.type === 'route-document' ? doc.layoutHref : undefined;
  if (role !== 'page' && role !== 'route') {
    return {
      role,
      isPage: false,
      hasLoad: false,
      hasPaths: false,
      hasLayout: false,
      strategy: NO_STRATEGY,
      ...(layoutHref ? { layoutHref } : {}),
      diagnostics: parsed.diagnostics,
    };
  }
  // The page's own `.fudapi`, when it links one: `load`, `paths`, `layout` and the strategy come
  // from it, and no longer from a `@server` (SDD-60 §4.5).
  const own = (('serverLinks' in doc ? doc.serverLinks : undefined) ?? [])
    .map((link) => linkHref(link))
    .flatMap((href) => (href === undefined || apiOf === undefined ? [] : [apiOf(href)]))
    .find((a): a is PageApi => a !== undefined && (a.load !== undefined || a.paths || a.layout));
  const server = serverStatements(source, doc.code);
  const names = new Set<string>();
  for (const statement of server.statements) {
    collectExports(statement, names);
  }
  // `_error.fud` is painted with the error it is handed: it declares no data of its own and no
  // functions to call (SDD-56 §4.8, `FUD1010`). The compiler's reading of the chain answers it.
  const errorPage =
    /(^|[\\/])_error\.fud$/u.test(file) && server.statements.length > 0
      ? readServerFns({
          server: server.statements,
          all: server.statements,
          map: server.map,
          browserNames: new Set(),
          component: false,
          errorPage: true,
        }).diagnostics.filter((d) => d.code === ERROR_PAGE_CODE)
      : [];
  return {
    role,
    isPage: true,
    hasLoad: own !== undefined ? own.load !== undefined : names.has('load'),
    hasPaths: own !== undefined ? own.paths : names.has('paths'),
    hasLayout: own !== undefined ? own.layout : names.has('layout'),
    ...(names.has('http') ? { hasHttp: true as const } : {}),
    ...(server.statements.some((s) => exportsConst(s, 'load')) ? { fluentLoad: true as const } : {}),
    strategy: own !== undefined ? strategyOfLoad(own.load) : strategyFrom(server.statements, file),
    ...(own !== undefined ? { api: own.id } : {}),
    ...(layoutHref ? { layoutHref } : {}),
    diagnostics: [...parsed.diagnostics, ...server.diagnostics, ...errorPage],
  };
}

/** The role of a structured document, in the plugin's vocabulary. */
function roleOf(doc: StructuredDocument): DocumentRole {
  switch (doc.type) {
    case 'page-document':
      return 'page';
    case 'route-document':
      return 'route';
    case 'layout-document':
      return 'layout';
    default:
      return 'component';
  }
}

/** Top-level statements of a `@server` region, parsed in one batch, with its syntax errors. */
function serverStatements(
  source: string,
  code: CodeBlockNode | undefined,
): {
  readonly statements: OxcNode[];
  readonly diagnostics: readonly Diagnostic[];
  /** Buffer offset → source offset. */
  readonly map: (offset: number) => number;
} {
  const regions = code?.parts.filter((p): p is ServerRegion => p.type === 'server-region') ?? [];
  if (regions.length === 0) {
    return { statements: [], diagnostics: [], map: (offset) => offset };
  }
  const batch = new JsBatch(source);
  const ids = regions.map((r) => batch.add('module-statements', r.js));
  const result = batch.parse();
  const statements: OxcNode[] = [];
  for (const id of ids) {
    const root = result.value.ast(id);
    statements.push(...(Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode]));
  }
  return { statements, diagnostics: result.diagnostics, map: result.value.mapOffset };
}

/** Whether `stmt` is `export const <name> = …` (or `let`/`var`). */
function exportsConst(stmt: OxcNode, name: string): boolean {
  const declaration = is(stmt, 'ExportNamedDeclaration') ? field(stmt, 'declaration') : undefined;
  if (declaration === undefined || !is(declaration, 'VariableDeclaration')) return false;
  return fieldArray(declaration, 'declarations').some((d) => {
    const id = field(d, 'id');
    return id !== undefined && is(id, 'Identifier') && nameOf(id) === name;
  });
}

/** Add the names exported by one `export …` statement (declaration or specifier list). */
function collectExports(stmt: OxcNode, out: Set<string>): void {
  if (!is(stmt, 'ExportNamedDeclaration')) {
    return;
  }
  const declaration = field(stmt, 'declaration');
  if (declaration) {
    if (is(declaration, 'FunctionDeclaration') || is(declaration, 'ClassDeclaration')) {
      const id = field(declaration, 'id');
      if (id) {
        out.add(nameOf(id));
      }
    } else if (is(declaration, 'VariableDeclaration')) {
      for (const d of fieldArray(declaration, 'declarations')) {
        const id = field(d, 'id');
        if (id && is(id, 'Identifier')) {
          out.add(nameOf(id));
        }
      }
    }
    return;
  }
  for (const spec of fieldArray(stmt, 'specifiers')) {
    const exported = field(spec, 'exported');
    if (exported) {
      out.add(nameOf(exported));
    }
  }
}
