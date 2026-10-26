import type { $Props } from './c-resto.fud';

export default {
  conformance: {
    post: { slug: 'hola', title: 'Hola', summary: 'Un saludo', tag: 'intro', featured: true, author: { name: 'Ana' } },
    label: 'Nombre',
    required: true,
    maxlength: 20,
  },
} satisfies Record<string, $Props>;
