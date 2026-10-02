import type { $Props } from './app-card.fud';

// The props each criterion of app-card.fudspec mounts the card with (`props <name>`).
export default {
  'titulo-largo': {
    title: 'A title long enough that it has to wrap onto a second line inside the card',
    href: '/blog/long',
  },
  destacada: { title: 'Featured', href: '/blog/featured', variant: 'highlight' },
  minima: { title: 'A', href: '/' },
} satisfies Record<string, $Props>;
