import { fileURLToPath } from 'node:url';
import { defineConfig } from 'rolldown';

/**
 * The published runtime of `@fudic/ssr` (SDD-45 §3.3): one bundled, minified file under
 * `runtime/`, beside the `dist/` a bundler consumes. Same two products as in `@fudic/core` —
 * `dist` is source for somebody else's build, `runtime` is this framework's own output,
 * already compiled, that a consumer fetches by URL.
 *
 * **Who fetches it is the Service Worker, and only the Service Worker** (§4.3.1). A document
 * never renders; the worker does. §4.10 moves it out of the worker's own bytes: instead of
 * being inlined into every application's `fudic-sw.js`, it is asked for once per origin and
 * per framework version, cache-first, and survives every deploy because its URL carries no
 * build id.
 *
 * **And it is the ONE published file of this framework that is not an ES module.** That is
 * not a taste: a Service Worker may not `import()` — the specification forbids it in that
 * scope — so the worker evaluates what it downloads with `new Function(exports, require,
 * module, …)`, which is the path it already uses for every route chunk. An `import`
 * statement inside that function body is a syntax error, so a renderer published as a module
 * could not be linked at all. It is published in the form its only consumer can evaluate.
 *
 * The same fact forces `@fudic/di` INSIDE this bundle. Its pieces are ES modules, because
 * pages import them, and this file cannot require an ES module any more than it can import
 * one. So injection's bytes end up twice on the origin — once as pieces for documents, once
 * inside this file for the worker — and that is the price, written down here and in the
 * bench's exceptions rather than discovered later. It buys ~6 kB out of every application's
 * worker and out of every one of its deploys.
 *
 * Two copies of DI's module state is not a hazard here, and the reason is worth keeping: a
 * document and a Service Worker are different realms and never shared one. Within the
 * worker's realm there is still exactly one copy, because nothing but this renderer reaches
 * injection there — a route chunk requires `@fudic/ssr` and never `@fudic/di`.
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The pieces of this package, piece name → entry module.
 *
 * ONE piece, named `index`, and both halves of that are §4.10 read literally: it names the URL
 * the worker will ask for, and it is a single file because this package has a single consumer
 * with a single need. The two rules of §4.3 ask of a frontier that it buy optionality or
 * sharing; between `serialize` and `tree` there is neither — the worker that renders one route
 * renders every route, and nothing else in the origin imports either — so splitting the
 * renderer would sell round trips for nothing.
 *
 * It keeps exactly the names `src/index.ts` exports today, which is what lets it enter
 * `builtins` unchanged: the chunks the linker evaluates resolve `@fudic/ssr` against that
 * object and must not notice the move.
 */
const PIECES: Readonly<Record<string, string>> = {
  index: 'src/index.ts',
};

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => ({
    input: { [piece]: here(`./${entry}`) },
    platform: 'browser' as const,
    /**
     * Erase a type-only import instead of leaving it as a side effect.
     *
     * `verbatimModuleSyntax` — which this repo requires and does not relax — turns
     * `import { type Dom } from '@fudic/dom'` into `import {} from '@fudic/dom'`, a bare import
     * that survives into the bundle and becomes a dependency on a package this renderer never
     * calls. `dist` keeps `verbatimModuleSyntax`, because there the statement is somebody
     * else's bundler's business; here the emit is the product.
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
      // CommonJS, and it is the only `cjs` in this framework's published output. See the
      // header: the worker cannot import, so it requires. Nothing is external — `@fudic/di`
      // included — because a `require` of a URL would be a second module system to serve.
      format: 'cjs' as const,
      // No hash: the version in the URL is the identity (§3.1), and a hash here would make the
      // name unpredictable to the plugin that has to write it into a worker.
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
