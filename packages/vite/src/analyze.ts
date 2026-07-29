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

import {
  JsBatch,
  type CodeBlockNode,
  type OxcNode,
  type ServerRegion,
  type StructuredDocument,
} from '@fudic/compiler';
import { parseFud } from './parse.js';
import { NO_STRATEGY, strategyFrom, type StrategyAnalysis } from './strategy.js';

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
  /** The `strategy()` call, read statically (SDD-20 §4.8). */
  readonly strategy: StrategyAnalysis;
  /** The `href` of `<link rel="layout">`, when the file declares one (SDD-21). */
  readonly layoutHref?: string;
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
export function analyzePage(source: string, file = ''): PageAnalysis {
  const doc = parseFud(source);
  const role = roleOf(doc);
  const layoutHref = doc.type === 'route-document' || doc.type === 'layout-document' ? doc.layoutHref : undefined;
  if (role !== 'page' && role !== 'route') {
    return {
      role,
      isPage: false,
      hasLoad: false,
      hasPaths: false,
      strategy: NO_STRATEGY,
      ...(layoutHref ? { layoutHref } : {}),
    };
  }
  const statements = serverStatements(source, doc.code);
  const names = new Set<string>();
  for (const statement of statements) {
    collectExports(statement, names);
  }
  return {
    role,
    isPage: true,
    hasLoad: names.has('load'),
    hasPaths: names.has('paths'),
    strategy: strategyFrom(statements, file),
    ...(layoutHref ? { layoutHref } : {}),
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

/** Top-level statements of a `@server` region, parsed in one batch. */
function serverStatements(source: string, code: CodeBlockNode | undefined): OxcNode[] {
  const regions = code?.parts.filter((p): p is ServerRegion => p.type === 'server-region') ?? [];
  if (regions.length === 0) {
    return [];
  }
  const batch = new JsBatch(source);
  const ids = regions.map((r) => batch.add('module-statements', r.js));
  const result = batch.parse();
  const statements: OxcNode[] = [];
  for (const id of ids) {
    const root = result.value.ast(id);
    statements.push(...(Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode]));
  }
  return statements;
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
