import { load, type Order } from 'fudic:routes/index';

const orders: Order[] = [
  { id: 1, item: 'Green tea', status: 'shipped' },
  { id: 2, item: 'Coffee', status: 'pending', note: 'Gift wrap' },
];

load.handle(() => ({ orders }));
