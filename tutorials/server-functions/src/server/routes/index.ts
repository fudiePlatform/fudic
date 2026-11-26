import { badRequest } from '@fudic/http';
import { greet } from 'fudic:routes/index';

greet.handle((ctx) => {
  if (ctx.args.name.trim() === '') throw badRequest('Write a name.');
  return `Hello, ${ctx.args.name}!`;
});
