import { addProduct, products } from 'fudic:routes/index';

const catalog = [
  { id: 1, name: 'Green tea', price: 4.5 },
  { id: 2, name: 'Black tea', price: 3.9 },
  { id: 3, name: 'Coffee', price: 6.2 },
];

products.handle((ctx) => catalog.filter((p) => p.name.toLowerCase().includes(ctx.args.q.toLowerCase())));

addProduct.handle((ctx) => {
  const product = { id: catalog.length + 1, ...ctx.args };
  catalog.push(product);
  return product;
});
