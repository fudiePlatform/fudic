/**
 * Build-id naming (SDD-27 §5.2): the chunks whose URL the client DERIVES get the build id
 * where Rollup put a content hash.
 *
 * Why this can be a rewrite instead of a redesign: a Rollup hash is 8 characters and so is
 * the build id (`BUILD_ID_LENGTH`), so the substitution moves no offset — the source maps
 * generated for that code still describe it, by construction. It is the same trick as
 * `BUILD_TOKEN` in the Service Worker, and for the same reason (BUG-05 §4.4).
 *
 * And there is no circularity: the build id is computed from the ORIGINAL hashed names, and
 * this runs afterwards. What changes is only how the client finds the file.
 *
 * SCOPE is deliberately narrow — the chunks the manifest derives URLs for, and nothing
 * else. A shared chunk nobody derives (`assets/element-*`) keeps its content hash, because
 * there the hash still does its job: the browser's HTTP cache can skip re-downloading it
 * across deploys. Renaming it would cost that for no gain.
 */

import { BUILD_ID_LENGTH } from './constants.js';
import { type FudicDiagnostic, FUD_HASH_LENGTH, FUD_NAME_COLLISION } from './diagnostics.js';

/**
 * `sw/c/blog-slug-N9OIQ_Kf.js` → dir `sw/c/`, base `blog-slug`, hash `N9OIQ_Kf`.
 *
 * Split by WIDTH, never by the last `-`. Rollup's hash alphabet is base64url, so a hash
 * contains `-` and `_` as readily as a chunk name does: `site-nav-Bq-vwUs5.js` is
 * `site-nav` + `Bq-vwUs5`, and splitting on the separator yields `site-nav-Bq`, a name no
 * file ever had. Anchored at the end with a fixed width there is exactly one split.
 */
const HASHED = new RegExp(`^(?:.*/)?.+-.{${String(BUILD_ID_LENGTH)}}\\.js$`, 'u');

/** `<hash>.js` — what the build id replaces, and the reason the length has to match. */
const SUFFIX = BUILD_ID_LENGTH + '.js'.length;

export interface RenamePlan {
  /** Old file name → new file name, for the `.js` files only. */
  readonly files: ReadonlyMap<string, string>;
  readonly diagnostics: readonly FudicDiagnostic[];
}

/**
 * Decide the new name of every file in `fileNames`. Returns an EMPTY plan — no rename at
 * all — when any of them is not a hashed chunk of the expected width: a partial rename
 * would leave the manifest deriving URLs for files that were never renamed, and half a
 * naming scheme is worse than none.
 */
export function planRename(fileNames: readonly string[], build: string): RenamePlan {
  const diagnostics: FudicDiagnostic[] = [];
  const candidates: Array<{ from: string; to: string }> = [];

  for (const fileName of fileNames) {
    if (!HASHED.test(fileName)) {
      diagnostics.push({
        code: FUD_HASH_LENGTH,
        message: `chunk "${fileName}" does not end in a ${String(BUILD_ID_LENGTH)}-character hash; build-id naming needs the default build.rollupOptions.output`,
        file: fileName,
      });
      return { files: new Map(), diagnostics };
    }
    // Sliced, not reassembled from capture groups: the shape is already guaranteed, and
    // cutting a fixed suffix cannot invent a name the way a group with a `??` fallback can.
    candidates.push({ from: fileName, to: `${fileName.slice(0, -SUFFIX)}${build}.js` });
  }

  // Without the hash, two chunks can want the same name: `/blog/:slug` and `/blog-slug`
  // both reduce to `blog-slug`, and so would a component tagged `blog-slug`. The pair
  // keeps its hash and the build says so — it degrades, it does not break.
  const owners = new Map<string, string[]>();
  for (const { from, to } of candidates) {
    owners.set(to, [...(owners.get(to) ?? []), from]);
  }
  const files = new Map<string, string>();
  for (const [to, claimants] of owners) {
    if (claimants.length > 1) {
      diagnostics.push({
        code: FUD_NAME_COLLISION,
        message: `chunk name collision after build-id naming: "${to}" is produced by ${claimants.join(' and ')}`,
        file: to,
      });
      continue;
    }
    for (const from of claimants) {
      files.set(from, to);
    }
  }
  return { files, diagnostics };
}

/** The base name of a path: `sw/c/x-AAAAAAAA.js` → `x-AAAAAAAA.js`. */
function baseOf(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf('/') + 1);
}

/**
 * Rewrite every reference to a renamed file inside `code`.
 *
 * Base names, not full paths: a chunk refers to a sibling as `./dep-<hash>.js` and to its
 * map as `dep-<hash>.js.map`, so replacing the base name catches the import, the `require`
 * and the `sourceMappingURL` in one pass — and only those, because a base name carries a
 * hash and cannot collide with ordinary text.
 */
export function rewriteReferences(code: string, plan: ReadonlyMap<string, string>): string {
  let out = code;
  for (const [from, to] of plan) {
    out = out.split(baseOf(from)).join(baseOf(to));
  }
  return out;
}

/** The `.map` companion of a renamed `.js`, for callers that emit the two separately. */
export function mapNameOf(fileName: string): string {
  return `${fileName}.map`;
}
