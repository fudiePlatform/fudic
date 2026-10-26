import type { $Props } from './c-orden.fud';

export default {
  conformance: {
    xs: [
      { n: 'c', p: 2 },
      { n: 'a', p: 1 },
      { n: 'd', p: 2 },
      { n: 'b', p: 1 },
    ],
  },
} satisfies Record<string, $Props>;
