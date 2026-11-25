import { notFound } from '@fudic/http';
import { load } from 'fudic:routes/index';

/** A value that arrives after `ms` milliseconds. */
function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

load.handle(() => ({
  title: 'Dashboard',
  stats: after(2000, { active: 87, total: 120 }),
  news: after(3000, '').then(() => {
    throw notFound('the news service is down');
  }),
}));
