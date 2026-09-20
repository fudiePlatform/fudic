/**
 * The coordinator: one module per ROUTE, and the only thing the application's build still
 * generates of the runtime (SDD-45 §4.4).
 *
 * `main` used to be a block, one per application, carrying the hydration runtime inside it.
 * What is left here is what its name always claimed: the module that names the pieces this
 * route needs and starts them with the parameters of THIS application. Everything else
 * travels as a published piece, identical for every app and every deploy.
 *
 * Five facts about it, and each one answers a rule of §1.5:
 *
 * - **It is the only place the folder and the build id live.** They are facts of the
 *   application, so they cannot be inside a piece two applications share. That is also why
 *   there are no attributes on the `<script>` and no second place to repeat them.
 * - **It names pieces, not capabilities.** A route without injection does not write the
 *   injection line, and then that piece does not exist for that route: not downloaded, not
 *   preloaded, not installed into the cache on its account.
 * - **It is named by its content.** Two routes that need the same thing produce the same
 *   source and therefore the same file — there is no artefact per route, there is one per
 *   combination, and that happens without anybody coordinating it.
 * - **A page that does not hydrate has no coordinator.** Not an empty file: no file and no
 *   tag.
 * - **It is the composition root, and it composes at BUILD time.** The order between pieces
 *   — the injection tree standing before the first component — is written by this generator,
 *   which knows it. What reaches the browser is some imports and some calls. There is no
 *   runtime registry of pieces: that would be downloading, on every page, a mechanism to
 *   resolve something that was already resolved when compiling.
 */

import { createHash } from 'node:crypto';

import { BUILD_TOKEN } from './constants.js';

/**
 * How the main thread turns a tag into the URL of its hydration chunk (SDD-17 §4.6).
 *
 * Two modes and no third, because there are exactly two ways a page can have been emitted.
 * In a BUILD the URL is DERIVED from the manifest's arithmetic — `hydrateUrl(tag)` — which is
 * why the build id has to travel inside this module. In DEV nothing is built: the component's
 * client module is served at a stable per-tag URL, and the build id does not exist.
 *
 * The choice is made at emit time, so the runtime never carries a branch for it.
 */
export type ChunkResolution =
  | { readonly mode: 'build'; readonly base: string }
  | { readonly mode: 'dev'; readonly urlPrefix: string };

/**
 * What a ROUTE is, as far as choosing its pieces goes (§4.4).
 *
 * Two questions and not five, and the missing three are the point. §4.4's table also lists
 * the DOM adapter, the signal and the fabricated-child bridge — and §4.4.1 takes them out of
 * the load: they are needed when something is hydrated, not when a page opens, and the warm
 * channel already fetches a component's chunk when it comes into view. Forms and reactivity
 * were never in the table: each component's own chunk drags them, and has since SDD-17.
 *
 * Both come from facts the compiler already has, which is why this is a table and not a
 * heuristic.
 */
export interface RouteFacts {
  /**
   * Anything to hydrate. Asked with the EMIT's own predicate (`needsRuntime`) and not with a
   * second one: the head writes the runtime tag under exactly this condition, and a build
   * that disagreed would emit a tag for a file it did not write.
   */
  readonly hydrates: boolean;
  /** The route publishes an injection map, so its tree has to stand before any component. */
  readonly injects: boolean;
}

/**
 * How this build names one piece: where to import it from, and under which name.
 *
 * Two shapes, and they are the two ways a piece can exist. In a BUILD it is a published URL
 * and the name is the uniform `install` of §3.4 — the coordinator imports the piece itself,
 * not the package that holds it. In DEV nothing is published (§4.15), so it is the package
 * specifier and the name the source exports; the dev server serves it out of Vite's module
 * graph, unversioned and hot-reloadable.
 *
 * The coordinator has the same SHAPE in both, which is what stops dev and build from being
 * two programs.
 */
export interface PieceRef {
  readonly from: string;
  readonly name: string;
}

/** What every coordinator of one application shares, and no piece may contain. */
export interface CoordinatorParams {
  readonly chunks: ChunkResolution;
  /**
   * The pieces a coordinator can name. Which of them it DOES name is the route's business
   * (`RouteFacts`); what they are called is this build's.
   *
   * The warm channel is already resolved to one of the two: they are exclusive — an
   * application has a Service Worker or it does not — and the page that knows which is this
   * one, so the runtime carries no branch for it and the channel not chosen is not named.
   */
  readonly pieces: {
    readonly hydrate: PieceRef;
    readonly warm: PieceRef;
    readonly di: PieceRef;
    readonly urls: PieceRef;
  };
}

/** A coordinator: its source, and the chunk name derived from that source. */
export interface Coordinator {
  /** `fudic-main-<hash>` — the chunk name, which decides the file name. */
  readonly name: string;
  readonly source: string;
}

/**
 * The module a route's tag loads, or `null` when the route has nothing to hydrate.
 *
 * `null` is the fourth fact above, and it is why this returns one rather than an empty
 * module: there is no file, and the head writes no tag for it either.
 */
export function coordinatorFor(
  facts: RouteFacts,
  params: CoordinatorParams,
): Coordinator | null {
  if (!facts.hydrates) return null;
  const source = coordinatorSource(facts, params);
  return { name: coordinatorName(source), source };
}

/**
 * `fudic-main-<8 hex of the source>`.
 *
 * Named by its CONTENT, so two routes that need the same pieces name the same file without
 * anybody arranging it, and a route whose needs change gets a different one. The hash is not
 * the build id and does not stand in for it: the build id is appended later, as it is for
 * every other chunk, and `planRename` replaces only the last segment.
 */
function coordinatorName(source: string): string {
  return `fudic-main-${createHash('sha256').update(source).digest('hex').slice(0, 8)}`;
}

/**
 * The source itself.
 *
 * Deliberately flat and deliberately short: everything here is a fact of the application, so
 * every line that is not one belongs in a piece. What it is allowed to contain is the folder,
 * the build id, and the ORDER in which the pieces of this route start.
 */
function coordinatorSource(facts: RouteFacts, params: CoordinatorParams): string {
  const { chunks, pieces } = params;
  const wanted: Array<readonly [PieceRef, string]> = [
    [pieces.hydrate, '$hydrate'],
    [pieces.warm, '$warm'],
  ];
  // Named only when the route publishes a map: then, and only then, does the piece exist for
  // this route — not downloaded, not preloaded, not precached on its account.
  if (facts.injects) wanted.push([pieces.di, '$di']);
  if (chunks.mode === 'build') wanted.push([pieces.urls, '$resolver']);

  // ONE statement per source. In a build every piece is its own URL and this changes nothing;
  // in dev two of them come out of `@fudic/core`, and two imports of one module would be a
  // difference between dev and build with nothing behind it.
  const bySource = new Map<string, string[]>();
  for (const [ref, as] of wanted) {
    bySource.set(ref.from, [...(bySource.get(ref.from) ?? []), `${ref.name} as ${as}`]);
  }
  const lines: string[] = [...bySource].map(
    ([from, names]) => `import { ${names.join(', ')} } from ${JSON.stringify(from)};`,
  );
  lines.push('');

  if (chunks.mode === 'build') {
    lines.push(
      `// The folder and the build id: the two facts of this application, in the one module`,
      `// that is allowed to hold them (§1.5 rule 3). The id is substituted in generateBundle`,
      `// like every other token — same length, so the source map still describes this.`,
      `const $urls = $resolver(${JSON.stringify(chunks.base)}, ${JSON.stringify(BUILD_TOKEN)});`,
      `const $chunk = (tag) => $urls.hydrateUrl(tag);`,
    );
  } else {
    lines.push(
      `// In dev nothing is built: the dev server publishes each component's client module at`,
      `// a stable URL per tag.`,
      `//`,
      `// ABSOLUTE, and that is the whole point of the \`new URL\`. Vite's dev import analysis`,
      `// rewrites every \`import(url)\` whose specifier is a runtime value into`,
      `// \`import(__vite__injectQuery(url, 'import'))\`, and that helper decorates a relative or`,
      `// root-relative path — and ONLY those. With a root-relative prefix the browser asks for`,
      `// \`…js?import\` while the warm named \`…js\`: two URLs, two downloads, and a preload that`,
      `// never lands.`,
      `const $prefix = new URL(${JSON.stringify(chunks.urlPrefix)}, document.baseURI).href;`,
      `const $chunk = (tag) => $prefix + tag + '.js';`,
    );
  }

  lines.push('');
  if (facts.injects) {
    lines.push(
      `// The two blocks the page printed. Reading them is the application's plumbing — where`,
      `// a document keeps its map — so it lives here; what to DO with the map is the piece's,`,
      `// and \`@fudic/di\` still never touches the DOM.`,
      `const $iocBlock = document.getElementById('fud-ioc');`,
      `const $seedBlock = document.getElementById('fud-di');`,
      `// The ORDER is written here, by the generator that knows it, and not discovered in the`,
      `// browser: the injection tree has to stand before the first component wakes up. It is`,
      `// STARTED and handed over as \`ready\` rather than awaited first — the capturer has to`,
      `// be listening from the first millisecond, because a click before it is installed is`,
      `// not deferred, it is lost.`,
      `const $tree = $iocBlock === null ? undefined : $di({`,
      `  map: JSON.parse($iocBlock.textContent),`,
      `  resolveChunk: $chunk,`,
      `  seed: $seedBlock === null ? undefined : JSON.parse($seedBlock.textContent),`,
      `});`,
    );
  }
  lines.push(
    `$hydrate({`,
    `  root: document,`,
    `  resolveChunk: $chunk,`,
    `  warm: $warm(),`,
    ...(facts.injects ? [`  ready: $tree,`] : []),
    `});`,
    '',
  );
  return lines.join('\n');
}
