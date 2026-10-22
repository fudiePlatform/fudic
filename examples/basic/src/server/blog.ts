/** What `routes/blog/index.fudapi` and `routes/blog/[slug].fudapi` declare, implemented. */

import { load as loadIndex } from 'fudic:routes/blog/index';
import { layout, load as loadPost, paths } from 'fudic:routes/blog/[slug]';
import { findPost, listPosts, listSlugs } from '../data/posts';

loadIndex.handle(async () => ({ title: 'Blog', posts: [...(await listPosts())] }));

loadPost.handle(async (ctx) => {
  const post = await findPost(ctx.params.slug);
  if (post === undefined) {
    return {
      title: 'Artículo no encontrado',
      tag: '404',
      body: `No hay ningún artículo con el slug "${ctx.params.slug}".`,
      found: false,
      lang: 'es',
    };
  }
  return { title: post.title, tag: post.tag, body: post.body, found: true, lang: post.lang };
});

paths.handle(async () => [...(await listSlugs())]);

// `seccion` is the required one: take it out of this object and the build stops with
// `FUD0702`, while the editor offers to complete the layout's required props.
layout.handle((_ctx, data) => ({ culture: data.lang, seccion: 'Blog' }));
