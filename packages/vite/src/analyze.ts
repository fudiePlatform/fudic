/**
 * Page fact extraction (SDD-19 §4.2 inputs). Parses a `.fud` with the compiler and
 * answers the questions the mode resolver needs: is this a page (not a component)? does the
 * `.fudapi` it links declare `load`, `paths` or `layout`? Those are what make a route's data
 * build-known (`load`) and its param space enumerable (`paths`).
 *
 * This is the plugin's bridge to the compiler — the parser hand-written in
 * `@fudic/compiler`, never Vite — and to the parser of `@fudic/api`, never Oxc (SDD-60 §4.5).
 */

import type { LoadDecl } from '@fudic/api';
import { linkHref, type Diagnostic, type StructuredDocument } from '@fudic/compiler';
import { parseFudReporting } from './parse.js';
import { NO_STRATEGY, strategyOfLoad, type StrategyAnalysis } from './strategy.js';

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
  /** Its `.fudapi` declares `load`. */
  readonly hasLoad: boolean;
  /** Its `.fudapi` declares `paths`. */
  readonly hasPaths: boolean;
  /** Its `.fudapi` declares `layout` — the layout props of this render (SDD-40 §3.2). */
  readonly hasLayout: boolean;
  /** The `load` line of its `.fudapi`, read statically (SDD-20 §4.8). */
  readonly strategy: StrategyAnalysis;
  /**
   * The `<id>` of the linked `.fudapi` that declares the page's `load`, `paths` or `layout`
   * (SDD-60 §3.4): the wrapper takes them from the registry, by it. Absent when none does.
   */
  readonly api?: string;
  /** The `href` of `<link rel="layout">`, when the file declares one (SDD-21). */
  readonly layoutHref?: string;
  /**
   * What the parse had to say, over this file's text (SDD-35 §4.4). Kept rather than dropped:
   * a route that does not parse is analysed all the same, and the build has to be told why.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** Analyze a `.fud` source: page vs component, and what its linked `.fudapi` declares. */
export function analyzePage(source: string, apiOf?: PageApiOf): PageAnalysis {
  const parsed = parseFudReporting(source);
  const doc = parsed.document;
  const role = roleOf(doc);
  // A ROUTE's link and nothing else. A layout that declares one is `FUD0439`: a mistake to
  // delete, not a relation — counting it as «this layout is used» would keep a layout alive
  // on the strength of a link the author has to remove anyway.
  const layoutHref = doc.type === 'route-document' ? doc.layoutHref : undefined;
  const isPage = role === 'page' || role === 'route';
  // The page's own `.fudapi`, when it links one: `load`, `paths`, `layout` and the strategy come
  // from it (SDD-60 §4.5).
  const own = !isPage
    ? undefined
    : (('serverLinks' in doc ? doc.serverLinks : undefined) ?? [])
        .map((link) => linkHref(link))
        .flatMap((href) => (href === undefined || apiOf === undefined ? [] : [apiOf(href)]))
        .find((a): a is PageApi => a !== undefined && (a.load !== undefined || a.paths || a.layout));
  return {
    role,
    isPage,
    hasLoad: own?.load !== undefined,
    hasPaths: own?.paths === true,
    hasLayout: own?.layout === true,
    strategy: own === undefined ? NO_STRATEGY : strategyOfLoad(own.load),
    ...(own !== undefined ? { api: own.id } : {}),
    ...(layoutHref ? { layoutHref } : {}),
    diagnostics: parsed.diagnostics,
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
