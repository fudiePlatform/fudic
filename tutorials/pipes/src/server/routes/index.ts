import { load } from 'fudic:routes/index';

load.handle(() => ({
  title: 'Pipes in five minutes',
  author: 'ada lovelace',
  published: new Date('2026-11-26T09:30:00Z'),
  tags: ['views', 'server', 'i18n'],
}));
