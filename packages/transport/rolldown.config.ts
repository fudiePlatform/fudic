import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rolldown';

/**
 * The published runtime of `@fudic/transport` (SDD-45 §3.3): one bundled, minified ES module
 * per piece, under `runtime/`, beside the `dist/` a bundler consumes. Same two products as in
 * `@fudic/core` — `dist` is source for somebody else's build, `runtime` is this framework's own
 * output, already compiled, that a browser fetches by URL.
 *
 * **This package publishes ONE piece, and that is the whole decision.** `@fudic/transport` is
 * not split, because it is the thing that opens the cache, holds the `Store` and holds the
 * linker (§4.10): asking it to fetch itself through the mechanism it implements is an
 * impossible start-up, so the store, the router, the linker and the manifest stay inside the
 * Service Worker bundle and get no piece.
 *
 * What the page needs from here is the other half: the URL arithmetic. The coordinator has to
 * turn a tag into the URL of its hydration chunk before anything can be hydrated, and that is
 * `urls` — the one part of this package a document reaches.
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The version comes from the `package.json`, which owns it — never from an option and never
 * from `fudic.json` (§2, SDD-41). It is what makes these files change, and therefore what
 * identifies them.
 */
const { version } = JSON.parse(readFileSync(here('./package.json'), 'utf8')) as {
  version: string;
};

/**
 * The pieces of this package, piece name → entry module.
 *
 * `urls` is a LIBRARY piece (§3.4): nobody starts it, the coordinator and the worker import
 * `createUrlResolver` from it, and it keeps exactly the names `src/urls.ts` exports today. No
 * `install`, because a uniform entry for an `import { createUrlResolver }` would be ceremony.
 *
 * `manifest` travels INSIDE it and gets no piece of its own, by the second rule of §4.3: it
 * has one consumer here — `urls` needs `safeName`, and the two reference each other — so a
 * frontier between them would be a toll and not a boundary. Nothing else in this package is
 * reached from `urls`, so no module of `@fudic/transport` can end up in two pieces: there is
 * only one.
 */
const PIECES: Readonly<Record<string, string>> = {
  urls: 'src/urls.ts',
};

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => ({
    input: { [piece]: here(`./${entry}`) },
    platform: 'browser' as const,
    /**
     * Erase a type-only import instead of leaving it as a side effect.
     *
     * `verbatimModuleSyntax` — which this repo requires and does not relax — turns
     * `import { type RouteRecord } from './manifest.js'` into `import {} from '…'` whenever the
     * value half is shaken out, and a bare import survives into the bundle as a REQUEST. Here
     * the emit is the product, so the statement has to go.
     */
    transform: { typescript: { onlyRemoveTypeImports: false } },
    onLog(level, log, defaultHandler) {
      // Rolldown reports the override above as a conflict on every build. It is the one
      // conflict here that is deliberate, and a warning nobody can act on is a warning
      // everybody learns to skip.
      if (log.code === 'CONFIGURATION_FIELD_CONFLICT') return;
      defaultHandler(level, log);
    },
    output: {
      dir: 'runtime',
      format: 'esm' as const,
      // No hash: the version in the URL is the identity (§3.1), and a hash here would make the
      // name unpredictable to the plugin that has to write it into a coordinator.
      entryFileNames: '[name].js',
      minify: true,
      /**
       * **A map per piece, and it does not cost determinism.** These files are minified
       * framework code served from `/_fudic/`, so without one they are undebuggable in the
       * browser — which is where this framework runs. This said « no source map, it would carry
       * absolute paths »; it does not. Rolldown writes `sources` relative to the output
       * directory, in POSIX form (`../src/index.ts`), and `sourcesContent` is the file's own
       * text. Nothing of the machine or the moment gets in, so §6.2 still holds: building twice
       * produces the same bytes, map included.
       *
       * A browser fetches a `.js.map` only when devtools is open, and the piece grows by the
       * `sourceMappingURL` line and nothing else.
       */
      sourcemap: true,
      comments: false,
    },
  })),
);
