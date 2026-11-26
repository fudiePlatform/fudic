import { notFound } from '@fudic/http';
import { load } from 'fudic:routes/blog/[slug]';

const posts: Record<string, string> = {
  hello: 'Hello, world',
  routing: 'Routing by folders',
};

load.handle((ctx) => {
  const title = posts[ctx.params.slug];
  if (title === undefined) throw notFound();
  return { title };
});
