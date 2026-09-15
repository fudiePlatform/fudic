/**
 * The example's "database": a plain module read from the `@server` regions of the
 * pages. It only ever runs on the server (build time for a prerendered route, in the
 * Web Worker for an incremental one) — it never reaches the browser bundle.
 *
 * That last sentence was written as an intention and was false until BUG-09: the edge
 * wrapper that imports this module was emitted as a chunk of the CLIENT build, so these
 * posts shipped in the clear as `dist/assets/posts-*.js`. The wrapper now lives in
 * `.fudic/edge/`, outside the published directory, and the claim holds.
 */

export interface Post {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly tag: string;
  readonly featured: boolean;
  /**
   * The language this post is written in.
   *
   * It is the evidence of SDD-40: the `lang` of the document comes out of the ROW, not out of
   * the URL and not out of a constant in the layout — so two prerendered slugs come out with
   * two different `<html lang>` because their posts are in two different languages.
   */
  readonly lang: string;
}

const POSTS: readonly Post[] = [
  {
    slug: 'declarative-shadow-dom',
    title: 'Declarative Shadow DOM, sin JavaScript',
    summary: 'El navegador monta el shadow root al parsear el HTML: cero JS para pintar.',
    body: 'Un <template shadowrootmode="open"> dentro de un custom element hace que el navegador cree el shadow root durante el parseo del documento. No hace falta JavaScript para que el componente se vea correcto en la primera pintura.',
    tag: 'plataforma',
    featured: true,
    lang: 'es',
  },
  // The one post in English, and the whole point of it: its `<html lang>` says `en` while
  // its two neighbours say `es`, and all three are written by the same build from the same
  // layout.
  {
    slug: 'file-system-routing',
    title: 'File-system routing',
    summary: 'routes/blog/[slug].fud is /blog/:slug. No route registry.',
    body: 'The plugin walks routesDir, orders the routes by descending specificity and publishes a route→chunk manifest that the Service Worker and the Web Worker both load from the SAME absolute URL.',
    tag: 'build',
    featured: false,
    lang: 'en',
  },
  {
    slug: 'ssg-estatico-e-incremental',
    title: 'SSG estático e incremental',
    summary: 'Lo enumerable se prerenderiza; lo demás lo renderiza el Web Worker.',
    body: 'Una página sin params ni load se prerenderiza en build. Una ruta con params y paths() prerenderiza el subconjunto enumerado. El resto queda dynamic:true: el Service Worker delega en el Web Worker y cachea la respuesta.',
    tag: 'build',
    featured: true,
    lang: 'es',
  },
];

/** All posts, newest first. Async on purpose: `load` is awaited. */
export async function listPosts(): Promise<readonly Post[]> {
  return POSTS;
}

/** One post by slug, or `undefined` when the slug is unknown. */
export async function findPost(slug: string): Promise<Post | undefined> {
  return POSTS.find((p) => p.slug === slug);
}

/** The slugs the build enumerates through `paths()`. */
export async function listSlugs(): Promise<readonly string[]> {
  return POSTS.map((p) => p.slug);
}
