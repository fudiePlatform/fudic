import type { $Props } from './c-desestructura.fud';

const ana = { slug: 'hola', title: 'Hola', summary: 'Un saludo', tag: 'intro', featured: true, author: { name: 'Ana', web: 'https://ana.dev' } };

export default {
  conformance: {
    posts: [
      ana,
      { slug: 'nulo', title: 'Nulo', summary: 'Con null', tag: 'x', featured: null, author: { name: 'Luis', web: null } },
      { slug: 'falta', title: 'Falta', summary: 'Sin campo', tag: 'y', author: { name: 'Marta' } },
    ],
    post: ana,
  },
} satisfies Record<string, $Props>;
