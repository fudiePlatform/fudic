import type { $Props } from './c-defectos.fud';

export default {
  conformance: {
    titulo: null,
    ficha: { nombre: null },
    fichas: [{ nombre: 'Ana', edad: 30 }, { nombre: null, edad: null }, { edad: 7 }],
  },
} satisfies Record<string, $Props>;
