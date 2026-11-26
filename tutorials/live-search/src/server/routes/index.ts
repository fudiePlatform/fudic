import { load, search } from 'fudic:routes/index';

const catalog = [
  { id: 1, name: 'Green tea' },
  { id: 2, name: 'Black tea' },
  { id: 3, name: 'Coffee' },
  { id: 4, name: 'Mate' },
];

load.handle(() => ({ products: catalog }));

search.handle(async (ctx) => {
  const q = ctx.args.q.toLowerCase();
  console.log(`searching "${q}"`);
  ctx.signal.addEventListener('abort', () => console.log(`cancelled "${q}"`));
  await new Promise((resolve) => setTimeout(resolve, 500));
  return catalog.filter((p) => p.name.toLowerCase().includes(q));
});
