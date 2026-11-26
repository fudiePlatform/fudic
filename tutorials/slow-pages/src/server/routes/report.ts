import { load } from 'fudic:routes/report';

/** A slow query: the total arrives after two seconds. */
function totalSales(): Promise<number> {
  return new Promise((resolve) => setTimeout(() => resolve(1234), 2000));
}

load.handle(async () => ({ title: 'Report', sales: await totalSales() }));
