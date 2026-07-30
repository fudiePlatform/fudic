/**
 * Route mode resolution (SDD-20 §4.8). Three modes, and ONE authority: the page.
 *
 *  - `ssr`  the server, always. The SW never intercepts and never downloads its chunk.
 *  - `ssg`  prerendered at build time. Zero route JavaScript.
 *  - `sw`   rendered locally by the Service Worker from its linked chunk.
 *
 * `strategy()` in the page wins (§4.8.2); the config's `defaults` only fills in for
 * routes that declare nothing. When nothing is declared at all, the filesystem facts
 * decide (§4.8.3) — we know them, so `ssr` as a universal default would be a worse
 * answer. `ssr` is never inferred: a route with session or permissions says so.
 *
 * Pure: the per-page facts are INJECTED. The plugin derives them from the compiler;
 * this only decides, and it never throws.
 */

import { type RouteMode } from '@fudic/transport';
import {
  type FudicDiagnostic,
  FUD_SSG_WITHOUT_PATHS,
  FUD_STRATEGY_AND_DEFAULT,
} from './diagnostics.js';
import { type StrategyAnalysis } from './strategy.js';

export type { RouteMode };

/** What the config's `defaults` may say about a route. */
export type ModeDefault = RouteMode | 'exclude';

export type ParamFallback = 'lazy' | 'notFound';

export interface PageFacts {
  /** Whether the page's `@server` region exports `load(ctx)`. */
  readonly hasLoad: boolean;
  /** Whether it exports `paths()` (build-time enumeration of param values). */
  readonly hasPaths: boolean;
  /** What the page declared, read statically. */
  readonly strategy: StrategyAnalysis;
  /** The config default for this route, if any. Never beats a declared strategy. */
  readonly fallback?: ModeDefault;
}

export interface ModeDecision {
  readonly mode: RouteMode | 'excluded';
  /** The build writes HTML for this route. */
  readonly prerender: boolean;
  /** With `paths()`: one file per enumerated params set. */
  readonly enumerate: boolean;
  /** Prerendered HTML exists, so the manifest carries its URL template. */
  readonly prerenderedHtml: boolean;
}

export interface ModeResult {
  readonly decision: ModeDecision;
  readonly diagnostics: readonly FudicDiagnostic[];
}

/**
 * Whether the Service Worker may render this route for ANY url matching its pattern —
 * which is what "it gets a linkable chunk" means (BUG-02 §4.6).
 *
 * Not `mode === 'sw'`: a prerendered route renders in the SW too, because prerendering
 * is a fact about the BUILD and says nothing about the client. But not an enumerated
 * `ssg` either: that is precisely `paramFallback: 'notFound'` (an enumerated route with
 * `lazy` is `sw`), and it declares that ids outside `paths()` are a 404. The SW does not
 * carry the enumeration, so it cannot tell a known id from an unknown one; giving it a
 * chunk would turn every unknown id into a local render.
 */
export function isLinkable(decision: ModeDecision): boolean {
  return (
    decision.mode !== 'ssr' &&
    decision.mode !== 'excluded' &&
    !(decision.mode === 'ssg' && decision.enumerate)
  );
}

function decision(
  mode: ModeDecision['mode'],
  prerender: boolean,
  enumerate: boolean,
  prerenderedHtml: boolean,
): ModeDecision {
  return { mode, prerender, enumerate, prerenderedHtml };
}

/** §4.8.3: what the filesystem facts imply when the page declares nothing. */
function inferred(hasParams: boolean, facts: PageFacts): RouteMode {
  if (!hasParams) {
    // Without `load` the data is build-known, so the page can be written once.
    return facts.hasLoad ? 'sw' : 'ssg';
  }
  return facts.hasPaths ? 'ssg' : 'sw';
}

/** Resolve the mode of one route, plus whatever the resolution wants to report. */
export function resolveMode(
  hasParams: boolean,
  facts: PageFacts,
  paramFallback: ParamFallback,
  file = '',
): ModeResult {
  const diagnostics: FudicDiagnostic[] = [];
  if (facts.strategy.declared && facts.fallback !== undefined) {
    diagnostics.push({
      code: FUD_STRATEGY_AND_DEFAULT,
      message: 'This route declares strategy() and also appears in defaults; the page wins',
      file,
    });
  }

  const declared: ModeDefault | undefined = facts.strategy.declared
    ? facts.strategy.strategy.mode
    : facts.fallback;

  if (declared === 'exclude') {
    return { decision: decision('excluded', false, false, false), diagnostics };
  }
  const mode: RouteMode = declared ?? inferred(hasParams, facts);

  if (mode === 'ssr') {
    return { decision: decision('ssr', false, false, false), diagnostics };
  }

  if (mode === 'ssg') {
    if (!hasParams) {
      return { decision: decision('ssg', true, false, true), diagnostics };
    }
    if (!facts.hasPaths) {
      // Nothing to enumerate: an explicit `ssg` here cannot be honoured.
      diagnostics.push({
        code: FUD_SSG_WITHOUT_PATHS,
        message: 'A param route needs paths() to be prerendered; falling back to sw',
        file,
      });
      return { decision: decision('sw', false, false, false), diagnostics };
    }
    // Enumerated. With a `lazy` fallback the pattern ALSO renders unknown ids locally,
    // so the record is `sw` and the prerendered files are preferred when they exist.
    return {
      decision: decision(paramFallback === 'lazy' ? 'sw' : 'ssg', true, true, true),
      diagnostics,
    };
  }

  // `sw`: rendered on demand. It is only reached with no enumerable param space (the
  // inference sends `params + paths()` down the `ssg` branch above), or because the
  // page asked for it explicitly — in which case not prerendering is the point.
  return { decision: decision('sw', false, false, false), diagnostics };
}
