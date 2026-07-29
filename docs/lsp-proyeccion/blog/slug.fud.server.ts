/* VIRTUAL server de blog/[slug].fud — zona neutra + @server */
type PageData = { title: string; tag: string; body: string; found: boolean };

import { findPost, listSlugs } from '../data/posts';

export async function load({ params }: { params: { slug: string } }): Promise<PageData> {
  const post = await findPost(params.slug);
  if (post === undefined) {
    return { title: 'Artículo no encontrado', tag: '404', body: `No hay ningún artículo con el slug "${params.slug}".`, found: false };
  }
  return { title: post.title, tag: post.tag, body: post.body, found: true };
}

export async function paths(): Promise<string[]> {
  return [...(await listSlugs())];
}
