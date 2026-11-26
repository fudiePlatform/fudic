import { load } from 'fudic:routes/live';

load.handle(() => ({
  title: 'Live',
  time: new Date().toISOString().slice(11, 19),
}));
