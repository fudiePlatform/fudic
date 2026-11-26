import { layout, load } from 'fudic:routes/blog';

const posts = [
  { slug: 'hello', title: 'Hello, world', tag: 'news' },
  { slug: 'layouts', title: 'One layout for every page', tag: 'guides' },
  { slug: 'errors', title: 'Your own error page', tag: 'guides' },
];

load.handle((ctx) => {
  const tag = ctx.url.searchParams.get('tag');
  return {
    title: tag === null ? 'Blog' : `Blog: ${tag}`,
    posts: tag === null ? posts : posts.filter((post) => post.tag === tag),
  };
});

layout.handle((ctx, data) => ({ area: data.title }));
