import { load } from 'fudic:routes/news';

load.handle(() => ({
  title: 'News',
  time: new Date().toISOString().slice(11, 19),
}));
