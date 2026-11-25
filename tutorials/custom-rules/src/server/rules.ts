import { aliasTaken } from 'fudic:rules/aliases';

const taken = ['admin', 'ada', 'grace'];

aliasTaken.check(async (value) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return !taken.includes(value);
});
