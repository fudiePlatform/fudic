/**
 * What `routes/blog/[slug].fudapi` declares, implemented. Compiled once per locale like a page:
 * `t` and `locale` in what it calls are the language of the page being painted.
 */

import { load, paths } from 'fudic:routes/blog/[slug]';
import { findPost, notFound, readingTime, slugs } from '../services/posts';

load.handle((ctx) => {
  const post = findPost(ctx.params.slug);
  return post === undefined
    ? { title: notFound(ctx.params.slug), time: '' }
    : { title: post.title, time: readingTime(post.minutes) };
});

paths.handle(() => slugs());
