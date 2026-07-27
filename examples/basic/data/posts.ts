/**
 * The example's "database": a plain module read from the `@server` regions of the
 * pages. It only ever runs on the server (build time for a prerendered route, in the
 * Web Worker for an incremental one) — it never reaches the browser bundle.
 */

export interface Post {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly tag: string;
  readonly featured: boolean;
}

const POSTS: readonly Post[] = [
  {
    slug: 'declarative-shadow-dom',
    title: 'Declarative Shadow DOM, sin JavaScript',
    summary: 'El navegador monta el shadow root al parsear el HTML: cero JS para pintar.',
    body: 'Un <template shadowrootmode="open"> dentro de un custom element hace que el navegador cree el shadow root durante el parseo del documento. No hace falta JavaScript para que el componente se vea correcto en la primera pintura.',
    tag: 'plataforma',
    featured: true,
  },
  {
    slug: 'routing-por-fichero',
    title: 'Routing por sistema de ficheros',
    summary: 'routes/blog/[slug].fud es /blog/:slug. Sin registro de rutas.',
    body: 'El plugin recorre routesDir, ordena las rutas por especificidad descendente y publica un manifest route→chunk que el Service Worker y el Web Worker cargan desde la MISMA URL absoluta.',
    tag: 'build',
    featured: false,
  },
  {
    slug: 'ssg-estatico-e-incremental',
    title: 'SSG estático e incremental',
    summary: 'Lo enumerable se prerenderiza; lo demás lo renderiza el Web Worker.',
    body: 'Una página sin params ni load se prerenderiza en build. Una ruta con params y paths() prerenderiza el subconjunto enumerado. El resto queda dynamic:true: el Service Worker delega en el Web Worker y cachea la respuesta.',
    tag: 'build',
    featured: true,
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
