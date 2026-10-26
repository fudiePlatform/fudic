import { aliasTaken } from 'fudic:rules/aliases';
import { aliasTaken as aliasInUse } from '../data/aliases';

aliasTaken.check(async (value) => !(await aliasInUse(value)));
