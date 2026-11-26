import type { Fixtures } from '@fudic/terms';
import type { $Props } from './myapp-badge.fud';

export default {
  base: { text: 'New' },
  warning: { text: 'Few left', tone: 'warning' },
  'sold-out': { text: 'Sold out', tone: 'warning' },
} satisfies Fixtures<$Props>;
