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
  type OxcNode,
  type PageDocument,
  type ServerRegion,
} from '@fudic/compiler';
import { parseFud } from './parse.js';

export interface PageAnalysis {
  /** True when the file is a page document (has a doctype), not a component. */
  readonly isPage: boolean;
  /** The `@server` region exports `load(ctx)`. */
  readonly hasLoad: boolean;
  /** The `@server` region exports `paths()`. */
  readonly hasPaths: boolean;
}

// ── Typed access over the untyped Oxc node (quarantined, as in the emit) ──
const is = (node: OxcNode | undefined, type: string): boolean => node?.type === type;
const field = (node: OxcNode, key: string): OxcNode | undefined => node[key] as OxcNode | undefined;
const fieldArray = (node: OxcNode, key: string): OxcNode[] => (node[key] as OxcNode[] | undefined) ?? [];
const nameOf = (node: OxcNode): string => String(node['name']);

/** Analyze a `.fud` source: page vs component, and which `@server` hooks it exports. */
export function analyzePage(source: string): PageAnalysis {
  const doc = parseFud(source);
  if (doc.type !== 'page-document') {
    return { isPage: false, hasLoad: false, hasPaths: false };
  }
  const names = serverExports(source, doc);
  return { isPage: true, hasLoad: names.has('load'), hasPaths: names.has('paths') };
}

/** The set of names exported from the page's `@server` region(s). */
function serverExports(source: string, doc: PageDocument): Set<string> {
  const names = new Set<string>();
  const regions =
    doc.code?.parts.filter((p): p is ServerRegion => p.type === 'server-region') ?? [];
  if (regions.length === 0) {
    return names;
  }

  const batch = new JsBatch(source);
  const ids = regions.map((r) => batch.add('module-statements', r.js));
  const result = batch.parse();
  for (const id of ids) {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    for (const stmt of stmts) {
      collectExports(stmt, names);
    }
  }
  return names;
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
