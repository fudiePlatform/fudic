import type { $Props } from './c-spread.fud';

export default {
  conformance: {
    enlace: { href: '/leer', title: 'del enlace', rel: 'next' },
    extra: { title: 'del extra', hidden: true },
    sinTitulo: { title: null, hidden: false },
    tarjeta: { title: 'Tarjeta', href: '/t' },
  },
} satisfies Record<string, $Props>;
