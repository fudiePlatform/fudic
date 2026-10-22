/** The routes of the test app. */

import { notFound, redirect } from '@fudic/http';
import { layout, load } from 'fudic:routes/blog/[slug]';
import { load as loadMoved } from 'fudic:routes/moved';
import { findPost } from '../data/posts';

load.handle(async (ctx) => {
  const post = await findPost(ctx.params.slug);
  if (post === undefined) throw notFound(`no post "${ctx.params.slug}"`);
  return { title: post.title, lang: post.lang };
});

layout.handle((_ctx, data) => ({ culture: data.lang }));

loadMoved.handle(() => {
  throw redirect('/blog/x', 302);
});
