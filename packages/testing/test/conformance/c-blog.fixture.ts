import type { $Props } from './c-blog.fud';

export default {
  conformance: {
    titular: 'Blog',
    posts: [
      { slug: 'hola', title: 'Hola', summary: 'Un saludo', tag: 'intro', featured: true },
      { slug: 'dsd', title: 'DSD', summary: 'Shadow DOM declarativo', tag: 'web', featured: null },
    ],
  },
} satisfies Record<string, $Props>;
