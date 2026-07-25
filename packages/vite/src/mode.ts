/**
 * SSG mode resolution (SDD-19 §4.2) — the escalera that decides, per route,
 * whether the build prerenders HTML (mode 1, `dynamic:false`) or the WW renders it
 * lazily and the SW persists it (mode 2, incremental, `dynamic:true`). The two
 * modes map onto SDD-16's `dynamic` flag, so the router needs no change.
 *
 * Pure: the per-page facts (`hasLoad`, `hasPaths`, override) are INJECTED. The
 * plugin derives them from the compiler; this only decides. Default-safe: when a
 * route's build-resolvability cannot be proven, it falls to incremental — the WW
 * can always render, at worst slower, never wrong.
 */

export type RouteMode = 'static' | 'incremental' | 'excluded';

export type ModeOverride = 'static' | 'incremental' | 'exclude';

export type ParamFallback = 'lazy' | 'notFound';

export interface PageFacts {
  /** Whether the page's `@server` region exports `load(ctx)`. */
  readonly hasLoad: boolean;
  /** Whether it exports `paths()` (build-time enumeration of param values). */
  readonly hasPaths: boolean;
  /** Per-route override from the config, if any. */
  readonly override?: ModeOverride;
}

export interface ModeDecision {
  readonly mode: RouteMode;
  /** The build prerenders HTML (a single file, or one per `paths()` entry when `enumerate`). */
  readonly prerender: boolean;
  /** With `paths()`: prerender one file per enumerated params set. */
  readonly enumerate: boolean;
  /** Emit a dynamic (incremental) manifest entry for the pattern. */
  readonly dynamic: boolean;
}

function decision(mode: RouteMode, prerender: boolean, enumerate: boolean, dynamic: boolean): ModeDecision {
  return { mode, prerender, enumerate, dynamic };
}

/** Resolve the static/incremental decision for one route. */
export function resolveMode(
  hasParams: boolean,
  facts: PageFacts,
  paramFallback: ParamFallback,
): ModeDecision {
  switch (facts.override) {
    case 'exclude':
      return decision('excluded', false, false, false);
    case 'incremental':
      return decision('incremental', false, false, true);
    case 'static':
      return staticDecision(hasParams, facts.hasPaths, paramFallback);
    default:
      break;
  }

  if (!hasParams) {
    // No params: static only when the data is build-known. With `load` we cannot
    // prove that (it may read the request), so default-safe → incremental (§4.2.4).
    return facts.hasLoad
      ? decision('incremental', false, false, true)
      : decision('static', true, false, false);
  }

  // With params: prerenderable only if `paths()` enumerates the space (§4.2.3);
  // otherwise incremental/lazy (§4.2.2).
  return facts.hasPaths
    ? staticDecision(true, true, paramFallback)
    : decision('incremental', false, false, true);
}

/** The forced/inferred static branch: prerender what can be enumerated. */
function staticDecision(hasParams: boolean, hasPaths: boolean, fallback: ParamFallback): ModeDecision {
  if (!hasParams) {
    return decision('static', true, false, false);
  }
  if (hasPaths) {
    // Prerender the enumerated ids; a `lazy` fallback also serves unknown ids
    // incrementally, so the pattern gets a dynamic entry too.
    return decision('static', true, true, fallback === 'lazy');
  }
  // Param route forced static without `paths()`: nothing to enumerate.
  return decision('static', false, false, false);
}
