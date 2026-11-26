import { rename, RenameFails } from 'fudic:routes/index';

rename.handle(async (ctx) => {
  console.log(`saving ${ctx.args.name}…`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (ctx.args.name === 'Admin') throw RenameFails.taken();
  console.log(`saved ${ctx.args.name}`);
  return ctx.args.name;
});
