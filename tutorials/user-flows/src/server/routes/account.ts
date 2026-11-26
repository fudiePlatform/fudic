import { load } from 'fudic:routes/account';

load.handle((ctx) => ({ user: ctx.cookies.get('session') ?? '' }));
