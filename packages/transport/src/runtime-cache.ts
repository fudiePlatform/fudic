/**
 * Who deletes the shared runtime cache (SDD-45 §4.9).
 *
 * Every other cache of this framework is namespaced `<kind>-<app>-<build>` and purged by
 * the worker that owns it (BUG-33). `fudic-runtime-<version>` is the one that carries no
 * app, on purpose: it is what two applications of an origin are meant to share, so
 * `isStaleCache` does not recognise it and never will.
 *
 * That leaves it with no owner, and a cache nobody dares delete does not save quota — it
 * spends it. No worker can know whether another application still runs this framework
 * version, so the answer is not coordination between applications but a MARK each one
 * leaves behind: `/_fudic/marker/<app>`, rewritten with the current date every time that
 * application's worker activates. A version whose marks have all expired is used by
 * nobody and goes.
 *
 * It is local and it heals itself. An application that moves to another framework version
 * stops refreshing its mark in the old one; an application that is retired stops
 * refreshing all of them; and one that is merely unvisited for a while keeps its cache
 * until it is genuinely abandoned. There is no registry to keep in sync, and nothing here
 * asks another application anything.
 */

import { STAMP_HEADER } from './store.js';

/**
 * How long a mark counts as alive.
 *
 * It belongs to the worker and not to whoever configures the plugin: what it expresses is
 * when an application can be presumed gone, which is a property of this mechanism and not
 * a taste. Thirty days is long enough that an application opened once a month keeps its
 * runtime, and short enough that a version nobody uses leaves the origin within a month of
 * the last worker that touched it.
 */
export const RUNTIME_MARKER_TTL = 30 * 24 * 60 * 60 * 1000;

export interface RuntimeSweepConfig {
  /** The origin's cache storage. Injected, so this is testable without a worker. */
  readonly caches: CacheStorage;
  /** The cache THIS worker's framework version uses: `fudic-runtime-0.0.1`. */
  readonly cache: string;
  /** What every runtime cache of the origin starts with: `fudic-runtime-`. */
  readonly prefix: string;
  /** This application's mark inside it: `/_fudic/marker/<app>`. */
  readonly marker: string;
  /** Injected clock, so expiry is testable without waiting a month. */
  readonly now?: () => number;
}

/** A mark is a stamp, and the whole of its content is the date it was written. */
const stampOf = async (cache: Cache, request: Request): Promise<number> => {
  const response = await cache.match(request);
  // `undefined` only if something deleted the entry between listing and reading it. A
  // mark that cannot be read counts as expired: the version it defends still needs one
  // living mark from somebody to survive.
  return response === undefined ? 0 : Number(await response.text());
};

/**
 * Refresh this application's mark, then delete every other version of the runtime cache
 * whose marks have all expired. Returns what it deleted, which is what a test asserts on
 * and what nothing in the worker reads.
 *
 * Our own cache is skipped rather than re-examined: the mark just written keeps it, and
 * spelling that out is cheaper than proving it.
 *
 * A cache with NO marks at all is left alone, and that is the conservative half of the
 * rule. It is the shape of a version whose pages are being served right now by a worker
 * that has not activated yet — the pieces are written by the fetch handler, the mark by
 * `activate` — and deleting it would throw away bytes somebody is mid-download of. An
 * unmarked cache costs one version of runtime; the first worker of that version to
 * activate marks it, and from then on the rule applies.
 */
export async function sweepRuntimeCaches(
  config: RuntimeSweepConfig,
): Promise<readonly string[]> {
  const at = (config.now ?? Date.now)();

  const mine = await config.caches.open(config.cache);
  // Sealed like every other entry the worker writes: the stamp says when it was stored, and a
  // mark is nothing BUT when it was stored. An unsealed entry in a fudic cache reads as one
  // written behind the Store's back, which is what BUG-04 §6.13 exists to catch.
  const stamp = String(at);
  await mine.put(config.marker, new Response(stamp, { headers: { [STAMP_HEADER]: stamp } }));

  // Every mark of every application lives in the same directory, so the directory is what
  // recognises one — read off our own mark rather than passed a second time, because two
  // parameters that must agree are a way for them to disagree.
  const dir = config.marker.slice(0, config.marker.lastIndexOf('/') + 1);
  const deleted: string[] = [];

  for (const name of await config.caches.keys()) {
    if (!name.startsWith(config.prefix) || name === config.cache) {
      continue;
    }
    const cache = await config.caches.open(name);
    const marks = (await cache.keys()).filter((request) =>
      new URL(request.url).pathname.startsWith(dir),
    );
    if (marks.length === 0) {
      continue;
    }
    const stamps = await Promise.all(marks.map((request) => stampOf(cache, request)));
    if (stamps.every((stamp) => at - stamp >= RUNTIME_MARKER_TTL)) {
      await config.caches.delete(name);
      deleted.push(name);
    }
  }

  return deleted;
}
