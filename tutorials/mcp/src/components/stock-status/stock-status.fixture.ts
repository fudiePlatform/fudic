import type { Fixtures } from '@fudic/terms';
import type { $Props } from './stock-status.fud';

export default {
  inStock: { inStock: true },
  outOfStock: { inStock: false },
} satisfies Fixtures<$Props>;
