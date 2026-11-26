import { aliasTaken } from 'fudic:rules/aliases';
import { aliasTaken as taken } from './users';

aliasTaken.check(async (value) => !(await taken(value)));
