/** The routes of the test app. */

import { notFound, redirect } from '@fudic/http';
import { layout, load } from 'fudic:routes/blog/[slug]';
import { load as loadEspera } from 'fudic:routes/espera';
import { load as loadMoved } from 'fudic:routes/moved';
import { load as loadRoto } from 'fudic:routes/roto';
import { like, load as loadTag, paths as pathsTag } from 'fudic:routes/tags/[tag]';
import { clock, load as loadGente, rename } from 'fudic:routes/gente';
import { inject } from '@fudic/di';
import { NOW } from '../services/now';
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

loadEspera.handle(() => ({ total: Promise.resolve(3) }));

loadRoto.handle(() => {
  throw new Error('the load broke');
});

loadTag.handle((ctx) => ({ tag: ctx.params.tag }));

// The third entry names no param of `/tags/:tag`: no URL can be made of it.
pathsTag.handle(() => ['uno', { tag: 'dos' }, { other: 'x' }] as never);

like.handle(() => 'liked');

loadGente.handle(() => ({ title: 'Real', names: ['real'] }));
rename.handle(() => 'renamed for real');
clock.handle(() => inject(NOW));
