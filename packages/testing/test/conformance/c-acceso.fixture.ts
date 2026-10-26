import type { $Props } from './c-acceso.fud';

export default {
  conformance: {
    post: { titulo: 'Hola', autor: { nombre: 'Ana', web: null }, coautor: null },
    xs: ['a', 'b', 'c'],
    m: { uno: 1, dos: 2 },
  },
} satisfies Record<string, $Props>;
